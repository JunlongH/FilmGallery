/**
 * Date Utilities - TypeScript Migration
 * 
 * Provides date formatting and parsing utilities for ISO date strings.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Convert a Date object to ISO date string (YYYY-MM-DD)
 * Uses local date components to avoid UTC timezone shifts
 */
export function toISODateString(date: Date | null | undefined): string {
  try {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    // Use local date components to avoid UTC timezone shifts
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
  } catch {
    return '';
  }
}

/**
 * Parse an ISO date string (YYYY-MM-DD) to a Date object
 * Ensures local date without timezone shift
 */
export function parseISODate(str: string | null | undefined): Date | null {
  if (!str) return null;
  // Ensure YYYY-MM-DD becomes local date without timezone shift
  const parts = str.split('-').map((v) => parseInt(v, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
