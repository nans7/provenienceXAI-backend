import mongoose from "mongoose";

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

export function getHealth(req, res) {
  const database = DB_STATES[mongoose.connection.readyState] ?? "unknown";
  res.status(database === "connected" ? 200 : 503).json({
    success: true,
    status: "ok",
    database,
    uptime: process.uptime(),
  });
}
