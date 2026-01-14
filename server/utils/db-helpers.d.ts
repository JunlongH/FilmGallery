/**
 * Type definitions for db-helpers.js
 * Database utility functions with Promise wrappers
 */

/**
 * Run a SQL statement (INSERT, UPDATE, DELETE)
 * @param sql - SQL statement
 * @param params - Query parameters
 * @returns Promise resolving to 'this' context with lastID, changes properties
 */
export function runAsync(
  sql: string,
  params?: any[]
): Promise<{ lastID?: number; changes?: number }>;

/**
 * Execute a query and return all matching rows
 * @param sql - SQL query
 * @param params - Query parameters
 * @returns Promise resolving to array of rows
 */
export function allAsync<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]>;

/**
 * Execute a query and return first matching row
 * @param sql - SQL query
 * @param params - Query parameters
 * @returns Promise resolving to single row or null
 */
export function getAsync<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null>;

/**
 * Validate photo update against roll date range
 * @param photoId - Photo ID
 * @param body - Update body with date_taken
 * @throws Error if date_taken is outside roll date range
 */
export function validatePhotoUpdate(
  photoId: number,
  body: { date_taken?: string }
): Promise<void>;
