import "dotenv/config";

const required = ["MONGODB_URI", "MONGODB_DATABASE"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI,
  mongoDatabase: process.env.MONGODB_DATABASE,
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.CONTACT_FROM_EMAIL,
    to: (process.env.CONTACT_TO_EMAIL ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean),
  },
};
