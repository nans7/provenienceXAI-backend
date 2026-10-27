import "dotenv/config";
import { globalConfig } from "./global.server.config.js";

const required = ["MONGO_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

export const env = {
  ...globalConfig,
  mongoUrl: process.env.MONGO_URL,
  adminApiToken: process.env.ADMIN_API_TOKEN ?? "",
  contactToEmails: (process.env.CONTACT_TO_EMAIL ?? "").split(",").map((email) => email.trim()).filter(Boolean),
  zeptomail: {
    from: "alerts@proveniencex.com",
    password: process.env.ZEPTOMAIL_ALERTS_PASSWORD ?? "",
  },
};
