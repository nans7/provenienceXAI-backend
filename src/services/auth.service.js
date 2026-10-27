import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/database.server.js";
import { json, readObject, sameOrigin } from "../utils/http.js";
import { clean, isEmail } from "../utils/validation.js";
import { env } from "../config/credential-config.js";
const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "px_session";
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;
export async function getSessionUser(request) {
    const rawToken = readToken(request);
    if (!rawToken)
        return null;
    const database = await getDatabase();
    const session = await database
        .collection("sessions")
        .findOne({ tokenHash: hashToken(rawToken), expiresAt: { $gt: new Date() } });
    if (!session || !ObjectId.isValid(session.userId))
        return null;
    const user = await database
        .collection("users")
        .findOne({ _id: new ObjectId(session.userId) });
    return user
        ? {
            id: user._id.toHexString(),
            name: user.name,
            organisation: user.organisation,
            email: user.email,
        }
        : null;
}
export async function handleAuthRequest(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/session") {
        if (request.method !== "GET")
            return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
        try {
            return json({ ok: true, user: await getSessionUser(request) });
        }
        catch (error) {
            return databaseFailure(error);
        }
    }
    if (!["/api/auth/signup", "/api/auth/login", "/api/auth/logout"].includes(path))
        return json({ error: "Not found." }, 404);
    if (request.method !== "POST")
        return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
    if (!sameOrigin(request))
        return json({ error: "Invalid request origin." }, 403);
    try {
        if (path === "/api/auth/logout") {
            const token = readToken(request);
            if (token)
                await (await getDatabase())
                    .collection("sessions")
                    .deleteOne({ tokenHash: hashToken(token) });
            return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, "", 0) });
        }
        const input = await readObject(request);
        if (!input)
            return json({ error: "Invalid form data." }, 400);
        const name = clean(input["name"]);
        const organisation = clean(input["organisation"]);
        const email = clean(input["email"]).toLowerCase();
        const password = typeof input["password"] === "string" ? input["password"] : "";
        if (!isEmail(email))
            return json({ error: "Enter a valid email address (up to 254 characters)." }, 400);
        if (password.length < 8 || password.length > 128)
            return json({ error: "Use a password between 8 and 128 characters." }, 400);
        if (path.endsWith("signup") &&
            (!name || !organisation || name.length > 120 || organisation.length > 160))
            return json({
                error: "Enter your name (up to 120 characters) and organisation (up to 160 characters).",
            }, 400);
        const database = await getDatabase();
        let user;
        if (path.endsWith("signup")) {
            const passwordSalt = randomBytes(16).toString("hex");
            const fields = {
                name,
                organisation,
                email,
                passwordSalt,
                passwordHash: await hashPassword(password, passwordSalt),
                createdAt: new Date(),
            };
            const result = await database.collection("users").insertOne(fields);
            user = { ...fields, _id: result.insertedId };
        }
        else {
            user = await database.collection("users").findOne({ email });
            if (!user || !(await passwordMatches(password, user.passwordSalt, user.passwordHash)))
                return json({ error: "Incorrect email address or password." }, 401);
        }
        const token = randomBytes(32).toString("base64url");
        await database.collection("sessions").insertOne({
            tokenHash: hashToken(token),
            userId: user._id.toHexString(),
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + SESSION_AGE_SECONDS * 1000),
        });
        return json({
            ok: true,
            user: {
                id: user._id.toHexString(),
                name: user.name,
                organisation: user.organisation,
                email: user.email,
            },
        }, 200, { "set-cookie": sessionCookie(request, token, SESSION_AGE_SECONDS) });
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 11000)
            return json({ error: "An account already exists for this email address." }, 409);
        return databaseFailure(error);
    }
}
async function hashPassword(password, salt) {
    return (await scrypt(password, salt, 64)).toString("hex");
}
async function passwordMatches(password, salt, expected) {
    const hash = Buffer.from(await hashPassword(password, salt), "hex");
    const stored = Buffer.from(expected, "hex");
    return hash.length === stored.length && timingSafeEqual(hash, stored);
}
function hashToken(value) {
    return createHash("sha256").update(value).digest("hex");
}
function readToken(request) {
    return request.headers
        .get("cookie")
        ?.split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${COOKIE_NAME}=`))
        ?.slice(COOKIE_NAME.length + 1);
}
function sessionCookie(request, value, age) {
    const secure = env.nodeEnv === "production" || new URL(request.url).protocol === "https:";
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${age}`;
}
function databaseFailure(error) {
    console.error("Authentication database error:", error);
    return json({ error: "Authentication is unavailable. Please try again shortly." }, 503);
}
