import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.ADMIN_API_TOKEN = "audit-test-token-".padEnd(64, "x");
process.env.MONGO_URL ??= "mongodb://localhost:27017";
const databaseName = "proveniencex_test";
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
process.env.CONTACT_TO_EMAIL = "";
process.env.ZEPTOMAIL_ALERTS_PASSWORD = "";
const { default: app } = await import("../src/app.js");
const { env } = await import("../src/config/credential-config.js");
const { Contact } = await import("../src/models/Contact.js");
let server;
let base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

test("contact administration rejects anonymous and incorrect credentials before database access", async () => {
  for (const [method, path] of [["GET", "/api/contact"], ["GET", "/api/contact/000000000000000000000001"], ["DELETE", "/api/contact/000000000000000000000001"]]) {
    for (const headers of [{}, { authorization: "Bearer wrong" }]) {
      const response = await fetch(base + path, { method, headers });
      assert.equal(response.status, 401);
    }
  }
});

test("administration fails closed when no token is configured", async () => {
  const original = env.adminApiToken;
  try {
    env.adminApiToken = "";
    assert.equal((await fetch(base + "/api/contact")).status, 503);
  } finally { env.adminApiToken = original; }
});

test("authorized administrator reaches the read handler", async (context) => {
  context.mock.method(Contact, "findById", async () => null);
  const response = await fetch(base + "/api/contact/000000000000000000000001", { headers: {authorization: `Bearer ${env.adminApiToken}`} });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).message, "Contact not found");
});

test("CORS allows configured development origins and excludes other sites", async () => {
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173", "https://untrusted.example"]) {
    const response = await fetch(base + "/api/contact", {method: "OPTIONS", headers: {origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type"}});
    assert.equal(response.headers.get("access-control-allow-origin"), origin.includes("untrusted") ? null : origin);
  }
});

test("malformed and oversized JSON produce client errors", async () => {
  const headers = {"content-type":"application/json"};
  assert.equal((await fetch(base+"/api/contact",{method:"POST",headers,body:"{"})).status,400);
  assert.equal((await fetch(base+"/api/contact",{method:"POST",headers,body:"null"})).status,400);
  assert.equal((await fetch(base+"/api/contact",{method:"POST",headers,body:JSON.stringify({message:"x".repeat(1024*1024)})})).status,413);
});

test("invalid email, payload types, and field lengths are rejected before saving",async()=>{
  const valid = {name:"Test",company:"Test",message:"Test",email:"user@example.com"};
  for(const body of [{...valid,email:"a@@example.com"},{...valid,email:"a..b@example.com"},{...valid,email:".user@example.com"},{...valid,email:"user@example..com"},{...valid,email:"user@-example.com"},{...valid,email:"a".repeat(255)+"@example.com"},{...valid,email:[]},{...valid,name:" "},{...valid,message:"x".repeat(5001)},[]]){
    const response=await fetch(base+"/api/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    assert.equal(response.status,400,JSON.stringify(body).slice(0,120));
  }
});

test("valid public contact submissions are normalized and saved without admin credentials",async(context)=>{
  let fields;
  context.mock.method(Contact,"create",async(data)=>{fields=data;return {...data,_id:"test-only-contact"};});
  // No outbound email is sent from this regression test.
  const recipients=env.contactToEmails;env.contactToEmails=[];
  try {
    const response=await fetch(base+"/api/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:" Test ",company:" Example ",email:" User+tag@Example.COM ",message:" Test enquiry "})});
    assert.equal(response.status,201);
    assert.equal((await response.json()).data.id,"test-only-contact");
    assert.equal(fields.email,"user+tag@example.com");
    assert.equal(fields.name,"Test");
    assert.equal(fields.message,"Test enquiry");
  } finally {env.contactToEmails=recipients;}
});

test("invalid pagination is rejected for authenticated administrators",async()=>{
  for(const query of ["page=1.5","page=Infinity","limit=1.5","page=0","limit=101"]){
    const response=await fetch(base+"/api/contact?"+query,{headers:{authorization:`Bearer ${env.adminApiToken}`}});
    assert.equal(response.status,400);
  }
});
