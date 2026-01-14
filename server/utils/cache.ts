/**
 * Cache Middleware - TypeScript Migration
 * 
 * Simple Cache-Control middleware with short-lived TTLs for GETs only.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Create cache control middleware for GET requests
 * 
 * @param seconds - Max-age in seconds (default 60)
 * @returns Express middleware
 */
export function cacheSeconds(seconds: number = 60): RequestHandler {
  const value = `public, max-age=${Math.max(0, seconds)}, stale-while-revalidate=30`;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', value);
    }
    next();
  };
}

// CommonJS compatibility
module.exports = { cacheSeconds };
