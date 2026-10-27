import { MongoClient } from "mongodb";
import { env } from "./credential-config.js";

let pendingClient;

// pt-live's getConnection(dbName) contract, with the in-flight connection cached
// too, so concurrent requests create only one MongoClient pool.
export async function getConnection(dbName = env.mongoDatabase) {
  if (typeof dbName !== "string" || !dbName.trim()) throw new Error("MongoDB database name is required.");
  if (!pendingClient) {
    const client = new MongoClient(env.mongoUrl, {
      dbName: env.mongoDatabase,
      serverSelectionTimeoutMS: 5000,
    });
    const connecting = client.connect().catch(async (error) => {
      if (pendingClient === connecting) pendingClient = undefined;
      await client.close().catch(() => undefined);
      throw error;
    });
    pendingClient = connecting;
  }
  const client = await pendingClient;
  return { db: client.db(dbName), client };
}

export async function closeConnection() {
  const current = pendingClient;
  pendingClient = undefined;
  const client = await current?.catch(() => undefined);
  await client?.close();
}
