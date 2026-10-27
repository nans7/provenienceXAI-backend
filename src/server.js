import app from "./app.js";
import { env } from "./config/credential-config.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { logger } from "./utils/logger.js";

async function start() {
  try {
    await connectDB();
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`Server running on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
