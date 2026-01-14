/**
 * Request Profiler - TypeScript Migration
 * 
 * Lightweight in-process request profiler for monitoring route performance.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Stats entry for a single route
 */
interface RouteStats {
  count: number;
  total: number;
  min: number;
  max: number;
}

/**
 * Profiler stats output entry
 */
export interface ProfilerEntry {
  route: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

/**
 * Profiler stats output
 */
export interface ProfilerStats {
  since: string;
  top: ProfilerEntry[];
}

const stats: Map<string, RouteStats> = new Map();

function keyFor(req: Request): string {
  return `${req.method} ${req.path}`;
}

function record(key: string, ms: number): void {
  const s = stats.get(key) || { count: 0, total: 0, min: Infinity, max: 0 };
  s.count += 1;
  s.total += ms;
  if (ms < s.min) s.min = ms;
  if (ms > s.max) s.max = ms;
  stats.set(key, s);
}

/**
 * Express middleware that profiles request timing
 */
export function requestProfiler(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      try {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1e6;
        record(keyFor(req), ms);
      } catch {
        /* ignore profiling errors */
      }
    });
    next();
  };
}

/**
 * Get current profiler statistics
 */
export function getProfilerStats(): ProfilerStats {
  const out: ProfilerEntry[] = [];
  for (const [k, s] of stats) {
    out.push({ route: k, count: s.count, avg: s.total / s.count, min: s.min, max: s.max });
  }
  out.sort((a, b) => b.count - a.count);
  return {
    since: new Date().toISOString(),
    top: out.slice(0, 50)
  };
}

let timer: NodeJS.Timeout | null = null;

/**
 * Schedule periodic profiler log output
 */
export function scheduleProfilerLog(intervalMs: number = 60000): void {
  if (timer) return;
  timer = setInterval(() => {
    const snapshot = getProfilerStats();
    if (snapshot.top.length) {
      console.log('[PROFILER] Top routes:', snapshot.top.slice(0, 5));
    }
  }, intervalMs);
}

// CommonJS compatibility
module.exports = { requestProfiler, getProfilerStats, scheduleProfilerLog };
