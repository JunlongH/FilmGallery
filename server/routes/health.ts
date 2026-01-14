/**
 * Health Check Routes
 * 
 * Provides database and system monitoring endpoints:
 * - Storage configuration status
 * - Database health (WAL mode, file sizes)
 * - Manual WAL checkpoint trigger
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs';
import { getDbPath } from '../config/db-config';
import { uploadsDir, rollsDir } from '../config/paths';
import PreparedStmt from '../utils/prepared-statements';
import db from '../db';

const router: Router = express.Router();

// Type definitions for internal use
interface StorageInfo {
  databasePath: string;
  uploadsDir: string;
  rollsDir: string;
  dataRoot: string | null;
  uploadsRoot: string | null;
}

interface FileInfo {
  exists: boolean;
  size: number;
  modified: Date | null;
}

interface WalInfo {
  mode: 'WAL' | 'TRUNCATE';
  walFile: { exists: boolean; size: number; modified: Date | null };
  shmFile: { exists: boolean; size: number };
}

interface DatabaseHealthResponse {
  status: 'healthy' | 'warning' | 'error';
  warnings?: string[];
  pragma: {
    journal_mode: string | null;
    synchronous: number | null;
    error?: string;
  };
  timestamp: string;
  database: FileInfo;
  wal: WalInfo;
  legacyJournal: {
    exists: boolean;
    size: number;
    warning: string | null;
  };
  preparedStatements: unknown;
  oneDriveCompatibility: {
    mode: string;
    status: string;
    notes: string;
  };
}

/**
 * GET /api/health
 * Returns current storage configuration (useful for Settings verification)
 */
router.get('/', (_req: Request, res: Response) => {
  const dbPath = getDbPath();
  res.json({
    ok: true,
    storage: {
      databasePath: dbPath,
      uploadsDir: uploadsDir,
      rollsDir: rollsDir,
      dataRoot: process.env.DATA_ROOT || null,
      uploadsRoot: process.env.UPLOADS_ROOT || null
    } as StorageInfo,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/health/database
 * Returns database health status including WAL file info
 */
router.get('/database', (_req: Request, res: Response) => {
  const dbPath = getDbPath();
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  const journalPath = dbPath + '-journal';
  const isWriteThrough = db.meta && db.meta.writeThrough;

  const health = {
    timestamp: new Date().toISOString(),
    database: {
      path: dbPath,
      exists: fs.existsSync(dbPath),
      size: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
      modified: fs.existsSync(dbPath) ? fs.statSync(dbPath).mtime : null,
    },
    wal: isWriteThrough ? {
      mode: 'TRUNCATE' as const,
      walFile: { exists: false, size: 0, modified: null },
      shmFile: { exists: false, size: 0 }
    } : {
      mode: 'WAL' as const,
      walFile: {
        exists: fs.existsSync(walPath),
        size: fs.existsSync(walPath) ? fs.statSync(walPath).size : 0,
        modified: fs.existsSync(walPath) ? fs.statSync(walPath).mtime : null,
      },
      shmFile: {
        exists: fs.existsSync(shmPath),
        size: fs.existsSync(shmPath) ? fs.statSync(shmPath).size : 0,
      }
    },
    legacyJournal: {
      exists: fs.existsSync(journalPath),
      size: fs.existsSync(journalPath) ? fs.statSync(journalPath).size : 0,
      warning: (!isWriteThrough && fs.existsSync(journalPath)) 
        ? 'Legacy journal file detected - should not exist in WAL mode' 
        : null,
    },
    preparedStatements: PreparedStmt.getStats(),
    oneDriveCompatibility: isWriteThrough ? {
      mode: 'TRUNCATE',
      status: 'write-through',
      notes: 'Write-through mode keeps changes in film.db immediately (no WAL/SHM)'
    } : {
      mode: 'WAL',
      status: 'optimized',
      notes: 'WAL mode allows OneDrive to sync main DB file while app is running'
    }
  };

  // Determine overall health status
  let status: 'healthy' | 'warning' | 'error' = 'healthy';
  const warnings: string[] = [];

  if (!isWriteThrough && fs.existsSync(journalPath)) {
    status = 'warning';
    warnings.push('Legacy journal file exists - database may not be in WAL mode');
  }

  if (!isWriteThrough && fs.existsSync(walPath)) {
    const walStats = fs.statSync(walPath);
    const walAge = Date.now() - walStats.mtimeMs;
    if (walAge > 600000) { // 10 minutes
      warnings.push(`WAL file has not been checkpointed in ${Math.round(walAge / 60000)} minutes`);
    }
    if (walStats.size > 50 * 1024 * 1024) { // 50MB
      status = 'warning';
      warnings.push(`WAL file is large (${Math.round(walStats.size / 1024 / 1024)}MB) - consider manual checkpoint`);
    }
  }

  // Query actual PRAGMA state from the live connection (best-effort)
  interface PragmaRow { journal_mode?: string; synchronous?: number }
  
  db.get('PRAGMA journal_mode', (err1: Error | null, row1: PragmaRow | undefined) => {
    db.get('PRAGMA synchronous', (err2: Error | null, row2: PragmaRow | undefined) => {
      const pragma = {
        journal_mode: row1?.journal_mode ?? null,
        synchronous: row2?.synchronous ?? null,
        error: (err1 || err2) 
          ? `${err1?.message || ''}${(err1 && err2) ? ' | ' : ''}${err2?.message || ''}`.trim() 
          : undefined
      };
      res.json({
        status,
        warnings: warnings.length > 0 ? warnings : undefined,
        pragma,
        ...health
      });
    });
  });
});

/**
 * POST /api/health/checkpoint
 * Manually trigger WAL checkpoint
 */
router.post('/checkpoint', async (_req: Request, res: Response) => {
  try {
    const result = await db.walCheckpoint();
    res.json({
      success: true,
      message: 'WAL checkpoint completed',
      changes: result.changes
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: (err as Error).message
    });
  }
});

export default router;

// CommonJS compatibility
module.exports = router;
