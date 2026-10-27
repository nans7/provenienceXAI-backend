import mongoose from "mongoose";
import { env } from "./credential-config.js";
import { logger } from "../utils/logger.js";
import { getConnection, closeConnection } from "./mongodb.server.config.js";

let pendingModels;
let listening = false;

export async function connectDB() {
  if (!listening) {
    mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
    mongoose.connection.on("error", () => logger.error("MongoDB connection error"));
    listening = true;
  }
  if (!pendingModels) {
    pendingModels = (async () => {
      const connection = await getConnection(env.mongoDatabase);
      // Preserve Mongoose schema validation and timestamps without opening
      // another connection pool for the contact models.
      if (mongoose.connection.getClient() !== connection.client) mongoose.connection.setClient(connection.client);
      logger.info(`MongoDB connected: ${env.mongoDatabase}`);
      return connection;
    })().catch(async (error) => {
      pendingModels = undefined;
      await closeConnection();
      throw error;
    });
  }
  return pendingModels;
}

export async function disconnectDB() {
  const current = pendingModels;
  pendingModels = undefined;
  await current?.catch(() => undefined);
  try { await mongoose.disconnect(); } finally { await closeConnection(); }
}
