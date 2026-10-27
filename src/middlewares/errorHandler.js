import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/credential-config.js";
import { logger } from "../utils/logger.js";

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, _next) {
  let error = err;

  if (err.type === "entity.parse.failed") {
    error = ApiError.badRequest("Invalid JSON body");
  } else if (err.type === "entity.too.large") {
    error = new ApiError(413, "Request body is too large");
  } else if (["encoding.unsupported", "charset.unsupported"].includes(err.type)) {
    error = new ApiError(415, "Unsupported request encoding");
  } else if (["request.aborted", "request.size.invalid"].includes(err.type)) {
    error = ApiError.badRequest("Invalid request body");
  } else if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest("Validation failed", details);
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  } else if (!(err instanceof ApiError)) {
    logger.error(err);
    error = new ApiError(500, "Internal server error");
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.details && { details: error.details }),
    ...(env.nodeEnv === "development" && error.statusCode === 500 && { stack: err.stack }),
  });
}
