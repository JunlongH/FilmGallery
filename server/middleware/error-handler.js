/**
 * Centralized Error Handling Middleware
 * 
 * Provides consistent error response format across all API routes.
 * Should be mounted after all other middleware and routes.
 */

/**
 * Express error handling middleware
 * @param {Error} err - The error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  // Log error for debugging (but don't expose internals to client)
  const errorId = Date.now().toString(36);
  console.error(`[ERROR ${errorId}] ${req.method} ${req.path}:`, err.message || err);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      ok: false,
      error: err.message,
      errorId,
    });
  }

  if (err.name === 'NotFoundError' || err.status === 404) {
    return res.status(404).json({
      ok: false,
      error: err.message || 'Resource not found',
      errorId,
    });
  }

  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({
      ok: false,
      error: 'Database constraint violation',
      errorId,
    });
  }

  if (err.code === 'SQLITE_BUSY') {
    return res.status(503).json({
      ok: false,
      error: 'Database is busy, please retry',
      errorId,
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      ok: false,
      error: 'File too large',
      errorId,
    });
  }

  // Default to 500 Internal Server Error
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'Internal server error',
    errorId,
  });
}

/**
 * 404 handler for unmatched routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

/**
 * Custom error classes for consistent error handling
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  ValidationError,
  NotFoundError,
};
