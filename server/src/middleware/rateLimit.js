/**
 * Rate limiting middleware with informational headers.
 * 
 * Adds standard rate limit headers to help agents understand limits:
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Requests remaining in window
 * - X-RateLimit-Reset: Unix timestamp when limit resets
 * - Retry-After: Seconds until retry (when rate limited)
 */

// Simple in-memory rate limiter (use Redis for production scale)
const requestCounts = new Map();

// Configuration
const RATE_LIMIT_CONFIG = {
  // General API endpoints
  api: {
    windowMs: 60 * 1000,  // 1 minute window
    maxRequests: 60,       // 60 requests per minute
  },
  // Poster generation (payment-gated, so more lenient)
  posters: {
    windowMs: 60 * 1000,  // 1 minute window
    maxRequests: 10,       // 10 posters per minute
  },
};

/**
 * Get client identifier (IP address or forwarded IP)
 */
function getClientId(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.socket?.remoteAddress 
    || 'unknown';
}

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts) {
    if (now > data.resetAt) {
      requestCounts.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Rate limit middleware factory
 */
export function rateLimit(type = 'api') {
  const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.api;

  return (req, res, next) => {
    const clientId = getClientId(req);
    const key = `${type}:${clientId}`;
    const now = Date.now();

    // Get or create rate limit data for this client
    let data = requestCounts.get(key);
    if (!data || now > data.resetAt) {
      data = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      requestCounts.set(key, data);
    }

    // Increment count
    data.count++;

    // Calculate remaining
    const remaining = Math.max(0, config.maxRequests - data.count);
    const resetTimestamp = Math.ceil(data.resetAt / 1000);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTimestamp.toString(),
    });

    // Check if rate limited
    if (data.count > config.maxRequests) {
      const retryAfter = Math.ceil((data.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      
      return res.status(429).json({
        error: 'TooManyRequests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      });
    }

    next();
  };
}

/**
 * Add informational rate limit headers without enforcement.
 * Useful for endpoints where you want to inform but not block.
 */
export function rateLimitHeaders(type = 'api') {
  const config = RATE_LIMIT_CONFIG[type] || RATE_LIMIT_CONFIG.api;

  return (req, res, next) => {
    // Just add informational headers without tracking
    res.set({
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Policy': `${config.maxRequests};w=${config.windowMs / 1000}`,
    });
    next();
  };
}

export { RATE_LIMIT_CONFIG };
