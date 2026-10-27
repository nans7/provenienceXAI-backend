import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";





process.env.MONGO_URL = process.env.MONGODB_TEST_URI ?? "mongodb://localhost:27017";

const databaseName = `proveniencex_test_${randomBytes(8).toString("hex")}`;
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
globalConfig.nodeEnv = "test";
process.env.CONTACT_TO_EMAIL = "";
process.env.ZEPTOMAIL_ALERTS_PASSWORD = "";
const { getConnection } = await import("../src/config/mongodb.server.config.js");
const { getDatabase, closeDatabase } = await import("../src/config/database.server.js");
const { handleAuthRequest } = await import("../src/services/auth.service.js");
const { handleHazardRequest } = await import("../src/services/hazard.service.js");
const { isEmail } = await import("../src/utils/validation.js");
const account = {
  name: "Regression Test",
  organisation: "Disposable test organisation",
  email: "regression@example.com",
  password: "test-password-123",
};
const brief = {
  area: "Test bay",
  hazard: "PPE non-compliance",
  conditions: "Test observation",
  exposed: "Test operators",
  frequency: "Daily",
  controls: "Existing signage",
};
const request = (path, body, cookie) =>
  new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
let cookie;
let planId;

after(async () => {
  // This suite only ever creates and drops its own random test database.
  const database = await getDatabase();
  assert.match(database.databaseName, /^proveniencex_test_[a-f0-9]{16}$/);
  await database.dropDatabase();
  await closeDatabase();
});

test("database initialization retries after a rejected connection", async (context) => {
  const connect = context.mock.method(MongoClient.prototype, "connect", async () => {
    throw new Error("Simulated outage");
  });
  await assert.rejects(getDatabase(), /Simulated outage/);
  connect.mock.restore();
  assert.equal((await getDatabase()).databaseName, databaseName);
});

test("named database connections share the same client pool", async () => {
  const [first, second] = await Promise.all([
    getConnection(),
    getConnection(databaseName + "_handle_only"),
  ]);
  assert.equal(first.client, second.client);
  assert.equal(first.db.databaseName, databaseName);
  assert.equal(second.db.databaseName, databaseName + "_handle_only");
});

test("email policy accepts common addresses and rejects the audit examples without truncation", () => {
  for (const value of ["user@example.com", "user+tag@example.co.uk", "first.last@sub.example.com"])
    assert.equal(isEmail(value), true, value);
  for (const value of [
    "",
    "plain",
    "a@@example.com",
    "a..b@example.com",
    ".user@example.com",
    "user.@example.com",
    "user@example..com",
    "user@-example.com",
    "user@example-.com",
    "user@localhost",
    "a".repeat(65) + "@example.com",
    "a@" + "b".repeat(250) + ".com",
  ])
    assert.equal(isEmail(value), false, value);
});

test("auth rejects null, arrays, malformed JSON, wrong origins, and invalid fields", async () => {
  for (const path of ["/api/auth/signup", "/api/auth/login"]) {
    for (const body of [
      null,
      [],
      {},
      { ...account, email: "a@@example.com" },
      { ...account, password: "short" },
      { ...account, password: "x".repeat(129) },
    ])
      assert.equal((await handleAuthRequest(request(path, body))).status, 400);
    const malformed = new Request(`http://localhost${path}`, { method: "POST", body: "{" });
    assert.equal((await handleAuthRequest(malformed)).status, 400);
    const crossOrigin = request(path, account);
    crossOrigin.headers.set("origin", "https://other.example");
    assert.equal((await handleAuthRequest(crossOrigin)).status, 403);
  }
  assert.equal(
    (await handleAuthRequest(request("/api/auth/signup", { ...account, name: " ".repeat(5) })))
      .status,
    400,
  );
});

test("signup hashes passwords, sets a usable HTTP development cookie, and rejects duplicate accounts", async () => {
  const response = await handleAuthRequest(request("/api/auth/signup", account));
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.doesNotMatch(response.headers.get("set-cookie"), /; Secure/);
  const user = await (await getDatabase()).collection("users").findOne({ email: account.email });
  assert.notEqual(user.passwordHash, account.password);
  assert.equal(user.password, undefined);
  assert.equal(
    (
      await handleAuthRequest(
        request("/api/auth/signup", { ...account, email: " REGRESSION@EXAMPLE.COM " }),
      )
    ).status,
    409,
  );
});

test("sessions restore identity and reject forged or expired tokens", async () => {
  let response = await handleAuthRequest(request("/api/auth/session", undefined, cookie));
  assert.equal((await response.json()).user.email, account.email);
  response = await handleAuthRequest(request("/api/auth/session", undefined, "px_session=forged"));
  assert.equal((await response.json()).user, null);
  await (
    await getDatabase()
  )
    .collection("sessions")
    .updateMany({}, { $set: { expiresAt: new Date(0) } });
  response = await handleAuthRequest(request("/api/auth/session", undefined, cookie));
  assert.equal((await response.json()).user, null);
});

test("login rejects wrong passwords and restores a fresh session", async () => {
  assert.equal(
    (
      await handleAuthRequest(
        request("/api/auth/login", { ...account, password: "wrong-password" }),
      )
    ).status,
    401,
  );
  const response = await handleAuthRequest(request("/api/auth/login", account));
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
});

test("anonymous hazard generation persists a preview without leaking locked recommendations", async () => {
  assert.equal((await handleHazardRequest(request("/api/hazard/plans", null))).status, 400);
  assert.equal(
    (await handleHazardRequest(request("/api/hazard/plans", { ...brief, area: " " }))).status,
    400,
  );
  const response = await handleHazardRequest(request("/api/hazard/plans", brief));
  assert.equal(response.status, 201);
  const { plan } = await response.json();
  planId = plan.id;
  assert.equal(plan.recommendations.length, 1);
  assert.equal(plan.lockedCount, 2);
  assert.match(plan.recommendations[0].nextStep, /Existing signage/);
  const stored = await (await getDatabase()).collection("hazardPlans").findOne({ _id: planId });
  assert.equal(stored.recommendations.length, 3);
  assert.equal(stored.brief.controls, brief.controls);
  assert.equal(
    (await (await handleHazardRequest(request(`/api/hazard/plans/${planId}`))).json()).plan
      .recommendations.length,
    1,
  );
});

test("unlock requires a valid session and enforces report ownership on later reads", async () => {
  const path = `/api/hazard/plans/${planId}/unlock`;
  assert.equal((await handleHazardRequest(request(path, {}))).status, 401);
  assert.equal((await handleHazardRequest(request(path, {}, "px_session=forged"))).status, 401);
  const response = await handleHazardRequest(request(path, {}, cookie));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).plan.recommendations.length, 3);
  assert.equal((await handleHazardRequest(request(`/api/hazard/plans/${planId}`))).status, 404);
  assert.equal(
    (
      await (
        await handleHazardRequest(request(`/api/hazard/plans/${planId}`, undefined, cookie))
      ).json()
    ).plan.lockedCount,
    0,
  );
  const other = await handleAuthRequest(
    request("/api/auth/signup", { ...account, email: "other@example.com" }),
  );
  const otherCookie = other.headers.get("set-cookie").split(";")[0];
  assert.equal((await handleHazardRequest(request(path, {}, otherCookie))).status, 404);
  assert.equal(
    (await handleHazardRequest(request(`/api/hazard/plans/${planId}`, undefined, otherCookie)))
      .status,
    404,
  );
});

test("expired plans are unavailable even before the MongoDB TTL cleanup runs", async () => {
  await (
    await getDatabase()
  )
    .collection("hazardPlans")
    .updateOne({ _id: planId }, { $set: { expiresAt: new Date(0) } });
  assert.equal(
    (await handleHazardRequest(request(`/api/hazard/plans/${planId}`, undefined, cookie))).status,
    404,
  );
});

test("logout awaits revocation and reports database failure without unhandled rejections", async (context) => {
  const db = await getDatabase();
  const collectionPrototype = Object.getPrototypeOf(db.collection("sessions"));
  const deletion = context.mock.method(collectionPrototype, "deleteOne", async () => {
    throw new Error("Simulated delete failure");
  });
  const log = context.mock.method(console, "error", () => {});
  assert.equal((await handleAuthRequest(request("/api/auth/logout", {}, cookie))).status, 503);
  deletion.mock.restore();
  log.mock.restore();
  const response = await handleAuthRequest(request("/api/auth/logout", {}, cookie));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await (await handleAuthRequest(request("/api/auth/session", undefined, cookie))).json()).user,
    null,
  );
});
