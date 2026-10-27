import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import mongoose from "mongoose";

process.env.MONGO_URL = process.env.MONGODB_TEST_URI ?? "mongodb://localhost:27017";
const databaseName = `proveniencex_backend_test_${randomBytes(8).toString("hex")}`;
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
globalConfig.nodeEnv = "test";
process.env.ADMIN_API_TOKEN = randomBytes(32).toString("hex");
process.env.ZEPTOMAIL_ALERTS_PASSWORD = "";
process.env.CONTACT_TO_EMAIL = "";
const {default:app}=await import("../src/app.js");
const {connectDB,disconnectDB}=await import("../src/config/db.js");
const {getConnection}=await import("../src/config/mongodb.server.config.js");
let server;
let base;
before(async()=>{
  await connectDB();
  server=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(mongoose.connection.readyState===1){
    assert.match(mongoose.connection.name,/^proveniencex_backend_test_[a-f0-9]{16}$/);
    await mongoose.connection.dropDatabase();
  }
  await disconnectDB();
});

test("real MongoDB contact submission, authorized reads, protected deletion, and cleanup",async()=>{
  assert.equal((await fetch(base+"/api/health")).status,200);
  const [first, second] = await Promise.all([getConnection(), getConnection(databaseName + "_handle_only")]);
  assert.equal(first.client, second.client);
  assert.equal(mongoose.connection.getClient(), first.client);
  assert.equal(first.db.databaseName, databaseName);
  assert.equal(second.db.databaseName, databaseName + "_handle_only");
  const created=await fetch(base+"/api/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:" Integration ",company:" Test ",email:" INTEGRATION@EXAMPLE.COM ",message:"Disposable test enquiry"})});
  assert.equal(created.status,201);
  const {data}=await created.json();
  assert.equal(data.emailSent,false);
  const headers={authorization:`Bearer ${process.env.ADMIN_API_TOKEN}`};
  assert.equal((await fetch(base+"/api/contact")).status,401);
  const listed=await (await fetch(base+"/api/contact",{headers})).json();
  assert.equal(listed.data.length,1);
  assert.equal(listed.data[0].email,"integration@example.com");
  const path=base+"/api/contact/"+data.id;
  assert.equal((await fetch(path,{method:"DELETE"})).status,401);
  assert.equal((await fetch(path,{headers})).status,200);
  assert.equal((await fetch(path,{method:"DELETE",headers})).status,200);
  assert.equal((await fetch(path,{headers})).status,404);
});

test("authentication and protected reports run through the backend HTTP routes",async()=>{
  const origin="http://127.0.0.1:5173";
  const headers={"content-type":"application/json",origin};
  const account={name:"HTTP Test",organisation:"Test",email:"http@example.com",password:"test-password-123"};
  const signup=await fetch(base+"/api/auth/signup",{method:"POST",headers,body:JSON.stringify(account)});
  assert.equal(signup.status,200);assert.equal(signup.headers.get("access-control-allow-origin"),origin);assert.equal(signup.headers.get("access-control-allow-credentials"),"true");
  const cookie=signup.headers.get("set-cookie").split(";")[0];
  const session=await fetch(base+"/api/auth/session",{headers:{cookie,origin}});
  assert.equal((await session.json()).user.email,account.email);
  const brief={area:"HTTP test bay",hazard:"PPE non-compliance",conditions:"Test observation",exposed:"Test operators",frequency:"Daily",controls:"Test signage"};
  const preview=await fetch(base+"/api/hazard/plans",{method:"POST",headers,body:JSON.stringify(brief)});
  assert.equal(preview.status,201);const {plan}=await preview.json();assert.equal(plan.recommendations.length,1);
  const path=base+"/api/hazard/plans/"+plan.id+"/unlock";
  assert.equal((await fetch(path,{method:"POST",headers})).status,401);
  const unlocked=await fetch(path,{method:"POST",headers:{...headers,cookie}});assert.equal(unlocked.status,200);assert.equal((await unlocked.json()).plan.recommendations.length,3);
  const logout=await fetch(base+"/api/auth/logout",{method:"POST",headers:{...headers,cookie}});assert.equal(logout.status,200);
  assert.equal((await (await fetch(base+"/api/auth/session",{headers:{cookie}})).json()).user,null);
  assert.equal((await fetch(base+"/api/auth/signup",{method:"POST",headers:{...headers,origin:"https://untrusted.example"},body:JSON.stringify(account)})).status,403);
});
