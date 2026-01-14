/**
 * Roll Service - Database maintenance functions for rolls table
 */

import { runAsync, allAsync } from '../utils/db-helpers';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface RecomputeResult {
  count?: number;
  skipped?: boolean;
}

/**
 * Ensure display_seq column exists in rolls table
 * Adds column via ALTER TABLE if missing
 */
async function ensureDisplaySeqColumn(): Promise<void> {
  // Check if column exists using PRAGMA
  const cols = await allAsync(`PRAGMA table_info(rolls)`) as ColumnInfo[];
  const hasCol = cols.some(c => c.name === 'display_seq');
  
  if (!hasCol) {
    try {
      await runAsync(`ALTER TABLE rolls ADD COLUMN display_seq INTEGER NOT NULL DEFAULT 0`);
      console.log('[MIGRATION] display_seq column created via ALTER TABLE');
    } catch (e) {
      console.error('[MIGRATION] Failed to add display_seq column:', (e as Error).message);
      throw e;
    }
  }
}

/**
 * Recompute display_seq for all rolls based on chronological order
 * 
 * Ordering logic:
 * 1. Rolls with start_date (chronologically ascending)
 * 2. Rolls without start_date, ordered by created_at
 * 3. Finally by id
 * 
 * @returns Object with count of recomputed rolls
 */
async function recomputeRollSequence(): Promise<RecomputeResult> {
  await ensureDisplaySeqColumn();
  
  // Always recompute to ensure correctness, but we can optimize if needed.
  // For now, let's force recompute if ANY roll has display_seq = 0
  const check = await allAsync(`SELECT COUNT(*) as cnt FROM rolls WHERE display_seq = 0`) as Array<{ cnt: number }>;
  if (check[0].cnt === 0) {
    // Check if the sequence is actually sequential? 
    // For now, assume if no zeros, it's likely fine. 
    // But user might have deleted rolls, leaving gaps. 
    // If we want strictly sequential 1..N, we should recompute if gaps exist.
    // Let's just recompute on startup. It's fast for <10k rows.
    // console.log('[MIGRATION] All rolls have display_seq, skipping recompute');
    // return { skipped: true };
  }

  const rows = await allAsync(`
    SELECT id
    FROM rolls
    ORDER BY 
      CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,
      start_date ASC,
      CASE WHEN created_at IS NULL THEN 1 ELSE 0 END,
      created_at ASC,
      id ASC
  `) as Array<{ id: number }>;

  if (rows.length === 0) return { count: 0 };

  await runAsync('BEGIN');
  try {
    let seq = 1;
    for (const r of rows) {
      await runAsync(`UPDATE rolls SET display_seq = ? WHERE id = ?`, [seq, r.id]);
      seq++;
    }
    await runAsync('COMMIT');
    console.log(`[MIGRATION] Recomputed display_seq for ${rows.length} rolls`);
  } catch (e) {
    try { await runAsync('ROLLBACK'); } catch(_) { /* ignore rollback error */ }
    throw e;
  }

  return { count: rows.length };
}

export { recomputeRollSequence };
