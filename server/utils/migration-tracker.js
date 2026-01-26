/**
 * Migration Tracker
 * 
 * Centralized migration management with version tracking.
 * Ensures migrations are only executed once and in order.
 * 
 * @module server/utils/migration-tracker
 */

const { runAsync, allAsync, getAsync } = require('./db-helpers');

/**
 * Ensure the migrations tracking table exists
 */
async function ensureMigrationsTable() {
  await runAsync(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration_ms INTEGER,
      success INTEGER DEFAULT 1,
      error_message TEXT
    )
  `);
}

/**
 * Check if a migration has already been executed
 * @param {string} name - Migration name (unique identifier)
 * @returns {Promise<boolean>}
 */
async function hasMigrationRun(name) {
  await ensureMigrationsTable();
  const row = await getAsync(
    'SELECT id FROM _migrations WHERE name = ? AND success = 1',
    [name]
  );
  return !!row;
}

/**
 * Record a successful migration
 * @param {string} name - Migration name
 * @param {number} durationMs - Execution time in milliseconds
 */
async function recordMigration(name, durationMs = 0) {
  await ensureMigrationsTable();
  await runAsync(
    `INSERT OR REPLACE INTO _migrations (name, executed_at, duration_ms, success) 
     VALUES (?, datetime('now'), ?, 1)`,
    [name, durationMs]
  );
  console.log(`[MIGRATION] Recorded: ${name} (${durationMs}ms)`);
}

/**
 * Record a failed migration
 * @param {string} name - Migration name
 * @param {string} errorMessage - Error message
 */
async function recordMigrationFailure(name, errorMessage) {
  await ensureMigrationsTable();
  await runAsync(
    `INSERT OR REPLACE INTO _migrations (name, executed_at, success, error_message) 
     VALUES (?, datetime('now'), 0, ?)`,
    [name, errorMessage]
  );
  console.error(`[MIGRATION] Failed: ${name} - ${errorMessage}`);
}

/**
 * Get list of all executed migrations
 * @returns {Promise<Array>}
 */
async function getExecutedMigrations() {
  await ensureMigrationsTable();
  return allAsync(
    'SELECT name, executed_at, duration_ms, success, error_message FROM _migrations ORDER BY id ASC'
  );
}

/**
 * Run a migration function if it hasn't been executed yet
 * @param {string} name - Unique migration name
 * @param {Function} migrationFn - Async function to execute
 * @param {Object} options - Options
 * @param {boolean} options.force - Force re-run even if already executed
 * @returns {Promise<{skipped: boolean, duration?: number, error?: string}>}
 */
async function runMigrationOnce(name, migrationFn, options = {}) {
  const { force = false } = options;
  
  // Check if already run
  if (!force && await hasMigrationRun(name)) {
    console.log(`[MIGRATION] Skipping (already executed): ${name}`);
    return { skipped: true };
  }
  
  console.log(`[MIGRATION] Running: ${name}`);
  const startTime = Date.now();
  
  try {
    await migrationFn();
    const duration = Date.now() - startTime;
    await recordMigration(name, duration);
    return { skipped: false, duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    await recordMigrationFailure(name, err.message);
    console.error(`[MIGRATION] Error in ${name}:`, err);
    return { skipped: false, duration, error: err.message };
  }
}

/**
 * Migration runner class for organizing multiple migrations
 */
class MigrationRunner {
  constructor() {
    this.migrations = [];
  }
  
  /**
   * Register a migration
   * @param {string} name - Unique migration name (use format: YYYYMMDD_description)
   * @param {Function} fn - Async migration function
   */
  add(name, fn) {
    this.migrations.push({ name, fn });
    return this;
  }
  
  /**
   * Run all registered migrations in order
   * @returns {Promise<{total: number, executed: number, skipped: number, failed: number}>}
   */
  async runAll() {
    await ensureMigrationsTable();
    
    const results = {
      total: this.migrations.length,
      executed: 0,
      skipped: 0,
      failed: 0
    };
    
    for (const migration of this.migrations) {
      const result = await runMigrationOnce(migration.name, migration.fn);
      
      if (result.skipped) {
        results.skipped++;
      } else if (result.error) {
        results.failed++;
      } else {
        results.executed++;
      }
    }
    
    console.log(`[MIGRATION] Summary: ${results.executed} executed, ${results.skipped} skipped, ${results.failed} failed`);
    return results;
  }
}

module.exports = {
  ensureMigrationsTable,
  hasMigrationRun,
  recordMigration,
  recordMigrationFailure,
  getExecutedMigrations,
  runMigrationOnce,
  MigrationRunner
};
