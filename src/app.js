import express from "express";
import cors from "cors";
import { env } from "./config/credential-config.js";
import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { configureAllowedOrigins } from "./utils/http.js";

const app = express();
app.set("env", env.nodeEnv);

// Keep the deployment allowlist here, following pt-live's app.js structure.
// Browser Origin headers have no trailing slash.
const allowedOrigins = [
  "https://www.proveniencex.com",
  "https://proveniencexai.com",
  "https://techieamigos.com",
];
if (env.nodeEnv !== "production") allowedOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");
configureAllowedOrigins(allowedOrigins);
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header("Origin");
  callback(null, {
    origin: origin && allowedOrigins.includes(origin) ? true : false,
    credentials: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};

app.use(cors(corsOptionsDelegate));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Frontend baseApiUrl is the domain only. API routing is defined here.
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
