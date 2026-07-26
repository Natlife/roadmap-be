const { errorResponse } = require('../utils/baseResponse');
const { config } = require('../config/env');

/**
 * Typed application error. Throw this from services/controllers to control
 * the HTTP status and client-facing message.
 */
class ApiError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(msg = 'Bad request', details) {
    return new ApiError(msg, 400, details);
  }
  static unauthorized(msg = 'Unauthorized') {
    return new ApiError(msg, 401);
  }
  static forbidden(msg = 'Forbidden') {
    return new ApiError(msg, 403);
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(msg, 404);
  }
  static conflict(msg = 'Conflict') {
    return new ApiError(msg, 409);
  }
}

/**
 * Wrap an async route handler so any thrown/rejected error is forwarded to the
 * centralized error middleware instead of crashing or hanging the request.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** 404 handler for unmatched routes. */
function notFoundHandler(req, res) {
  res
    .status(404)
    .json(errorResponse(`Route ${req.method} ${req.originalUrl} not found`, 404));
}

/** Translate a raw MySQL driver error into a friendly ApiError. */
function mapDatabaseError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return new ApiError('A record with these details already exists.', 409);
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return new ApiError('Referenced record does not exist.', 400);
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return new ApiError('Cannot delete: this record is still referenced by others.', 409);
    case 'ER_BAD_NULL_ERROR':
      return new ApiError('A required field is missing.', 400);
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
      return new ApiError('Database is temporarily unavailable. Please try again.', 503);
    default:
      return null;
  }
}

/** Centralized error middleware. Must be registered last. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiError = err;

  if (!(err instanceof ApiError)) {
    apiError = (err && err.code && mapDatabaseError(err)) || null;
  }

  if (!apiError) {
    // Unknown/unexpected error — log full detail, expose a generic message.
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
    apiError = new ApiError('Internal server error', 500);
  } else if (apiError.statusCode >= 500) {
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err);
  }

  const payload = errorResponse(apiError.message, apiError.statusCode);
  if (apiError.details) payload.details = apiError.details;
  if (!config.isProd && apiError.statusCode >= 500) payload.stack = err.stack;

  res.status(apiError.statusCode).json(payload);
}

module.exports = {
  ApiError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};
