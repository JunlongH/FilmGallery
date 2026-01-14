/**
 * Gear Service
 * 
 * Manages roll equipment associations with intelligent deduplication:
 * - Cameras, lenses, and photographers linked to rolls
 * - Automatic removal of substring duplicates
 * - Batch operations for efficient bulk updates
 */

import { runAsync, allAsync } from '../utils/db-helpers';

// Interfaces
export interface GearResult {
  added: boolean;
  removed: string[];
}

export interface GearBatchInput {
  cameras?: string[];
  lenses?: string[];
  photographers?: string[];
}

export interface GearBatchResult {
  cameras: number;
  lenses: number;
  photographers: number;
}

export interface RollGear {
  cameras: string[];
  lenses: string[];
  photographers: string[];
}

export interface DeduplicationResult {
  processed: number;
  removed: number;
}

type GearType = 'camera' | 'lens' | 'photographer';

interface GearRow {
  value: string;
}

interface RollGearRow {
  type: string;
  value: string;
}

interface RollIdRow {
  roll_id: number;
}

/**
 * Add or update gear for a roll with intelligent deduplication
 * - Removes old values that are substrings of new values
 * - Example: "Junlong" absorbs "Junlong Huang" when updating to "Junlong"
 */
export async function addOrUpdateGear(
  rollId: number,
  type: GearType,
  newValue: string
): Promise<GearResult> {
  if (!rollId || !type || !newValue || typeof newValue !== 'string') {
    return { added: false, removed: [] };
  }

  const trimmedValue = newValue.trim();
  // Ignore placeholder or empty values
  const isPlaceholder = trimmedValue === '-' || trimmedValue === '--' || trimmedValue === '—';
  if (!trimmedValue || isPlaceholder) {
    // Proactively remove any existing placeholder entries for this type
    try {
      await runAsync(
        'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND (value = "" OR value = "-" OR value = "--" OR value = "—")',
        [rollId, type]
      );
    } catch {
      /* ignore - placeholders may not exist */
    }
    return { added: false, removed: [] };
  }

  try {
    // Get all existing gear of this type for this roll
    const existing = await allAsync<GearRow>(
      'SELECT value FROM roll_gear WHERE roll_id = ? AND type = ?',
      [rollId, type]
    );

    const existingValues = existing.map(r => r.value);
    const removed: string[] = [];
    let needsInsert = true;

    // Check if new value already exists (exact match)
    if (existingValues.includes(trimmedValue)) {
      needsInsert = false;
    }

    // Find values to remove (intelligent deduplication)
    for (const oldValue of existingValues) {
      // Skip self
      if (oldValue === trimmedValue) continue;

      // Remove placeholders
      if (!oldValue || oldValue === '-' || oldValue === '--' || oldValue === '—') {
        await runAsync('DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?', [rollId, type, oldValue]);
        removed.push(oldValue);
        continue;
      }

      // Case 1: Old value is a substring of new value
      if (trimmedValue.toLowerCase().includes(oldValue.toLowerCase())) {
        await runAsync(
          'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
          [rollId, type, oldValue]
        );
        removed.push(oldValue);
      }
      // Case 2: New value is a substring of old value
      else if (oldValue.toLowerCase().includes(trimmedValue.toLowerCase())) {
        await runAsync(
          'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
          [rollId, type, oldValue]
        );
        removed.push(oldValue);
      }
    }

    // Add new value if needed
    if (needsInsert) {
      try {
        await runAsync(
          'INSERT INTO roll_gear (roll_id, type, value) VALUES (?, ?, ?)',
          [rollId, type, trimmedValue]
        );
        return { added: true, removed };
      } catch (err: unknown) {
        // If INSERT fails due to UNIQUE constraint, it means another process added it
        if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT') {
          return { added: false, removed };
        }
        throw err;
      }
    }

    return { added: false, removed };
  } catch (error) {
    console.error('[gear-service] addOrUpdateGear failed:', error);
    throw error;
  }
}

/**
 * Batch add multiple gear items to a roll
 */
export async function addGearBatch(
  rollId: number,
  gearData: GearBatchInput = {}
): Promise<GearBatchResult> {
  const result: GearBatchResult = { cameras: 0, lenses: 0, photographers: 0 };

  if (!rollId) return result;

  const { cameras = [], lenses = [], photographers = [] } = gearData;

  // Process cameras
  for (const camera of cameras) {
    if (camera && typeof camera === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'camera', camera);
      if (added) result.cameras++;
    }
  }

  // Process lenses
  for (const lens of lenses) {
    if (lens && typeof lens === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'lens', lens);
      if (added) result.lenses++;
    }
  }

  // Process photographers
  for (const photographer of photographers) {
    if (photographer && typeof photographer === 'string') {
      const { added } = await addOrUpdateGear(rollId, 'photographer', photographer);
      if (added) result.photographers++;
    }
  }

  return result;
}

/**
 * Remove a specific gear value from a roll
 */
export async function removeGear(
  rollId: number,
  type: GearType,
  value: string
): Promise<boolean> {
  if (!rollId || !type || !value) return false;

  try {
    const result = await runAsync(
      'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
      [rollId, type, value]
    );
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('[gear-service] removeGear failed:', error);
    throw error;
  }
}

/**
 * Get all gear for a roll, grouped by type
 */
export async function getRollGear(rollId: number): Promise<RollGear> {
  const gear: RollGear = { cameras: [], lenses: [], photographers: [] };

  if (!rollId) return gear;

  try {
    const rows = await allAsync<RollGearRow>(
      'SELECT type, value FROM roll_gear WHERE roll_id = ? ORDER BY type, value',
      [rollId]
    );

    rows.forEach(r => {
      if (r.type === 'camera') gear.cameras.push(r.value);
      else if (r.type === 'lens') gear.lenses.push(r.value);
      else if (r.type === 'photographer') gear.photographers.push(r.value);
    });

    return gear;
  } catch (error) {
    console.error('[gear-service] getRollGear failed:', error);
    throw error;
  }
}

/**
 * Deduplicate all gear entries across all rolls
 * Removes substring duplicates (e.g., "Jun" when "Junlong" exists)
 */
export async function deduplicateAllGear(): Promise<DeduplicationResult> {
  try {
    const rolls = await allAsync<RollIdRow>('SELECT DISTINCT roll_id FROM roll_gear');
    let totalRemoved = 0;

    for (const { roll_id } of rolls) {
      // Process each gear type separately
      for (const type of ['camera', 'lens', 'photographer'] as const) {
        const values = await allAsync<GearRow>(
          'SELECT value FROM roll_gear WHERE roll_id = ? AND type = ? ORDER BY LENGTH(value) DESC',
          [roll_id, type]
        );

        const valueStrings = values.map(v => v.value);
        const toRemove = new Set<string>();

        // Find substring duplicates
        for (let i = 0; i < valueStrings.length; i++) {
          for (let j = i + 1; j < valueStrings.length; j++) {
            const longer = valueStrings[i];
            const shorter = valueStrings[j];

            if (longer.toLowerCase().includes(shorter.toLowerCase())) {
              toRemove.add(shorter);
            }
          }
        }

        // Remove duplicates
        for (const value of toRemove) {
          await runAsync(
            'DELETE FROM roll_gear WHERE roll_id = ? AND type = ? AND value = ?',
            [roll_id, type, value]
          );
          totalRemoved++;
        }
      }
    }

    return { processed: rolls.length, removed: totalRemoved };
  } catch (error) {
    console.error('[gear-service] deduplicateAllGear failed:', error);
    throw error;
  }
}

// CommonJS compatibility
module.exports = {
  addOrUpdateGear,
  addGearBatch,
  removeGear,
  getRollGear,
  deduplicateAllGear
};
