/**
 * Conflicts Routes
 * 
 * Provides endpoints for database conflict detection and resolution
 * Used for OneDrive sync conflict handling
 */

import express, { Request, Response, Router } from 'express';
import path from 'path';
import conflictResolver from '../conflict-resolver';

const router: Router = express.Router();

/**
 * Get data directory based on environment configuration
 */
function getDataDir(): string {
  if (process.env.DATA_ROOT) {
    return process.env.DATA_ROOT;
  } else if (process.env.USER_DATA) {
    return process.env.USER_DATA;
  } else {
    return path.join(__dirname, '../');
  }
}

/**
 * GET /api/conflicts
 * Check for database conflicts
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const dataDir = getDataDir();
    const status = await conflictResolver.getConflictStatus(dataDir);
    res.json(status);
  } catch (err) {
    console.error('[CONFLICTS API] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/conflicts/resolve
 * Trigger auto-merge for database conflicts
 */
router.post('/resolve', async (_req: Request, res: Response) => {
  try {
    const dataDir = getDataDir();
    console.log('[CONFLICTS API] Triggering auto-cleanup...');
    const count = await conflictResolver.autoCleanup(dataDir);
    res.json({ ok: true, conflictsProcessed: count });
  } catch (err) {
    console.error('[CONFLICTS API] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
