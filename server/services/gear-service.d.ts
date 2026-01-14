/**
 * Type definitions for gear-service.js
 * Provides type safety without full TypeScript migration
 */

export interface GearUpdateResult {
  added: boolean;
  removed: string[];
}

export interface EquipmentData {
  cameras?: string[];
  lenses?: string[];
  photographers?: string[];
}

export interface RollGearMap {
  [rollId: number]: EquipmentData;
}

/**
 * Add or update gear for a roll with intelligent deduplication
 * - Removes old values that are substrings of new values
 * - Example: "Junlong" absorbs "Junlong Huang" when updating to "Junlong"
 * 
 * @param rollId - Roll ID
 * @param type - Gear type: 'camera', 'lens', or 'photographer'
 * @param newValue - New gear value to add
 * @returns Result with added status and removed values
 */
export function addOrUpdateGear(
  rollId: number,
  type: 'camera' | 'lens' | 'photographer',
  newValue: string
): Promise<GearUpdateResult>;

/**
 * Batch update gear for multiple rolls
 * @param updates - Array of {rollId, type, value} objects
 * @returns Results for each update
 */
export function batchUpdateGear(
  updates: Array<{ rollId: number; type: string; value: string }>
): Promise<GearUpdateResult[]>;

/**
 * Get all gear for a specific roll
 * @param rollId - Roll ID
 * @returns Object with cameras, lenses, photographers arrays
 */
export function getRollGear(rollId: number): Promise<EquipmentData>;

/**
 * Get gear for multiple rolls in one query
 * @param rollIds - Array of roll IDs
 * @returns Map of rollId -> {cameras, lenses, photographers}
 */
export function getBatchRollGear(rollIds: number[]): Promise<RollGearMap>;

/**
 * Remove a specific gear entry from a roll
 * @param rollId - Roll ID
 * @param type - Gear type
 * @param value - Exact value to remove
 * @returns Number of rows deleted (0 or 1)
 */
export function removeGear(
  rollId: number,
  type: 'camera' | 'lens' | 'photographer',
  value: string
): Promise<number>;

/**
 * Get all unique gear values of a specific type across all rolls
 * @param type - Gear type
 * @returns Array of unique values
 */
export function getAllGearValues(
  type: 'camera' | 'lens' | 'photographer'
): Promise<string[]>;
