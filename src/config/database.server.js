import { getConnection, closeConnection } from "./mongodb.server.config.js";

let indexedClient;
let pendingIndexes;

export async function getDatabase() {
  const { db, client } = await getConnection();
  if (indexedClient !== client || !pendingIndexes) {
    indexedClient = client;
    pendingIndexes = Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("hazardPlans").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch((error) => {
      indexedClient = undefined;
      pendingIndexes = undefined;
      throw error;
    });
  }
  await pendingIndexes;
  return db;
}

export async function closeDatabase() {
  indexedClient = undefined;
  pendingIndexes = undefined;
  await closeConnection();
}
