/**
 * Standardized error handling for consistent API responses.
 * 
 * Error response format:
 * {
 *   "error": "Error type",
 *   "message": "Human-readable description", 
 *   "code": "ERROR_CODE",
 *   "details": {} // Optional additional context
 * }
 */

// Standard error codes
export const ErrorCodes = {
  // Validation errors
  INVALID_CITY: 'INVALID_CITY',
  INVALID_COUNTRY: 'INVALID_COUNTRY',
  INVALID_THEME: 'INVALID_THEME',
  INVALID_SIZE: 'INVALID_SIZE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Resource errors
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  POSTER_NOT_FOUND: 'POSTER_NOT_FOUND',
  THEME_NOT_FOUND: 'THEME_NOT_FOUND',

  // Payment errors
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  PAYMENT_INVALID: 'PAYMENT_INVALID',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',

  // Processing errors
  GEOCODING_FAILED: 'GEOCODING_FAILED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/**
 * Custom API error class
 */
export class APIError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'APIError';
  }

  toJSON() {
    const response = {
      error: this.name,
      message: this.message,
      code: this.code,
    };
    if (this.details) {
      response.details = this.details;
    }
    return response;
  }
}

/**
 * Create common error responses
 */
export const Errors = {
  invalidCity: (message = 'City not found or invalid') => 
    new APIError(400, ErrorCodes.INVALID_CITY, message),
  
  invalidCountry: (message = 'Country not found or invalid') => 
    new APIError(400, ErrorCodes.INVALID_COUNTRY, message),
  
  invalidTheme: (theme) => 
    new APIError(400, ErrorCodes.INVALID_THEME, `Theme '${theme}' not found`),
  
  invalidSize: (size) => 
    new APIError(400, ErrorCodes.INVALID_SIZE, `Size preset '${size}' not recognized`),
  
  validationError: (message, details) => 
    new APIError(400, ErrorCodes.VALIDATION_ERROR, message, details),
  
  jobNotFound: (jobId) => 
    new APIError(404, ErrorCodes.JOB_NOT_FOUND, `Job '${jobId}' not found`),
  
  posterNotFound: (jobId) => 
    new APIError(404, ErrorCodes.POSTER_NOT_FOUND, `Poster for job '${jobId}' not found`),
  
  geocodingFailed: (city) => 
    new APIError(400, ErrorCodes.GEOCODING_FAILED, `Could not geocode location: ${city}`),
  
  generationFailed: (message = 'Poster generation failed') => 
    new APIError(500, ErrorCodes.GENERATION_FAILED, message),
  
  internalError: (message = 'An internal error occurred') => 
    new APIError(500, ErrorCodes.INTERNAL_ERROR, message),
};

/**
 * Express error handling middleware.
 * Catches errors and returns standardized JSON responses.
 */
export function errorHandler(err, req, res, next) {
  // Log error for debugging
  console.error(`[Error] ${err.code || 'UNKNOWN'}: ${err.message}`);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Handle APIError instances
  if (err instanceof APIError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle validation errors from express-validator or similar
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'ParseError',
      message: 'Invalid JSON in request body',
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  // Default to internal server error
  res.status(500).json({
    error: 'InternalError',
    message: process.env.NODE_ENV === 'production' 
      ? 'An internal error occurred' 
      : err.message,
    code: ErrorCodes.INTERNAL_ERROR,
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
  });
}
