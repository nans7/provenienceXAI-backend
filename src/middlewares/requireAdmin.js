import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/credential-config.js";
import { ApiError } from "../utils/ApiError.js";

// Administrative credentials are server-only and must never be embedded in the website.
export function requireAdmin(req, _res, next) {
  if (!env.adminApiToken || env.adminApiToken.length < 32) {
    return next(new ApiError(503, "Contact administration is not configured"));
  }
  const authorization = req.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const digest = (value) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(env.adminApiToken))) {
    return next(new ApiError(401, "Administrator authentication required"));
  }
  next();
}
