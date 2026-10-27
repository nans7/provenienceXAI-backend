import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { MongoClient } from "mongodb";

process.env.MONGO_URL = "mongodb://localhost:27017";
const databaseName = "proveniencex_connection_test";
const { globalConfig } = await import("../src/config/global.server.config.js");
globalConfig.mongoDatabase = databaseName;
const { getConnection, closeConnection } = await import("../src/config/mongodb.server.config.js");
afterEach(closeConnection);

test("concurrent database requests use one pending MongoClient connection",async(context)=>{
  let count=0;
  context.mock.method(MongoClient.prototype,"connect",async function(){count++;return this;});
  const [first,second,third]=await Promise.all([getConnection("first"),getConnection("second"),getConnection("first")]);
  assert.equal(count,1);
  assert.equal(first.client,second.client);assert.equal(first.client,third.client);
  assert.equal(first.db.databaseName,"first");assert.equal(second.db.databaseName,"second");
});

test("a rejected connection is cleared so the next request can retry",async(context)=>{
  let count=0;
  context.mock.method(MongoClient.prototype,"connect",async function(){count++;if(count===1)throw new Error("Simulated outage");return this;});
  await assert.rejects(getConnection(),/Simulated outage/);
  const connection=await getConnection();
  assert.equal(count,2);assert.equal(connection.db.databaseName,databaseName);
});

test("closing the cached client allows a fresh connection",async(context)=>{
  context.mock.method(MongoClient.prototype,"connect",async function(){return this;});
  const first=await getConnection();await closeConnection();
  const second=await getConnection();assert.notEqual(first.client,second.client);
});
