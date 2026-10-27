import assert from "node:assert/strict";
import { before, after, test } from "node:test";

process.env.MONGO_URL="mongodb://localhost:27017";
const databaseName = "proveniencex_cors_test";
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
globalConfig.nodeEnv = "production";
const {default:app}=await import("../src/app.js");
let server;let base;
before(async()=>{server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));});

test("app.js allows exactly the requested production origins with credentialed API headers",async()=>{
  for(const origin of ["https://www.proveniencex.com","https://proveniencexai.com","https://techieamigos.com","http://localhost:5173","http://127.0.0.1:5173","https://untrusted.example"]){
    const response=await fetch(base+"/api/auth/login",{method:"OPTIONS",headers:{origin,"access-control-request-method":"POST","access-control-request-headers":"content-type,authorization"}});
    if(origin.startsWith("https://")&&!origin.includes("untrusted")){
      assert.equal(response.headers.get("access-control-allow-origin"),origin);
      assert.equal(response.headers.get("access-control-allow-credentials"),"true");
      assert.match(response.headers.get("access-control-allow-headers"),/Content-Type/i);
      assert.match(response.headers.get("access-control-allow-headers"),/Authorization/i);
    } else assert.equal(response.headers.get("access-control-allow-origin"),null);
  }
});
