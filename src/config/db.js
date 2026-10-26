import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

export async function connectDB() {
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("error", (error) => logger.error("MongoDB error:", error.message));

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDatabase,
    serverSelectionTimeoutMS: 5000,
  });
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${env.mongoDatabase}`);
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
