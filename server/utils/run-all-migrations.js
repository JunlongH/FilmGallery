/**
 * Unified Migration Runner
 * 
 * Orchestrates all database migrations with tracking.
 * This module consolidates the various migration scripts and uses
 * the migration-tracker for version control.
 * 
 * @module server/utils/run-all-migrations
 */

const { MigrationRunner, hasMigrationRun } = require('./migration-tracker');

/**
 * Run all registered migrations with tracking
 * 
 * Note: We wrap existing migration functions to integrate with the tracker.
 * Migrations that have already run (recorded in _migrations table) will be skipped.
 * 
 * @returns {Promise<Object>} Migration summary
 */
async function runAllMigrations() {
  console.log('[MIGRATIONS] Starting unified migration runner...');
  
  const runner = new MigrationRunner();
  
  // =========================================
  // Register migrations in chronological order
  // =========================================
  
  // Core schema migration (creates base tables)
  runner.add('20240101_core_schema', async () => {
    const { runMigration } = require('./migration');
    await runMigration();
  });
  
  // Schema updates (ALTER TABLE operations)
  runner.add('20240601_schema_updates', async () => {
    const { runSchemaMigration } = require('./schema-migration');
    await runSchemaMigration();
  });
  
  // Equipment tables (cameras, lenses, etc.)
  runner.add('20241001_equipment_tables', async () => {
    const { runEquipmentMigration } = require('./equipment-migration');
    await runEquipmentMigration();
  });
  
  // Film structure (brand, format, process)
  runner.add('20241101_film_structure', async () => {
    const { runFilmStructMigration } = require('./film-struct-migration');
    await runFilmStructMigration();
  });
  
  // Roll display sequence
  runner.add('20241201_roll_display_seq', async () => {
    const { recomputeRollSequence } = require('../services/roll-service');
    await recomputeRollSequence();
  });
  
  // =========================================
  // Run all migrations
  // =========================================
  const results = await runner.runAll();
  
  console.log('[MIGRATIONS] Unified migration complete:', results);
  return results;
}

/**
 * Check migration status without running
 * @returns {Promise<Object>}
 */
async function getMigrationStatus() {
  const { getExecutedMigrations } = require('./migration-tracker');
  
  const executed = await getExecutedMigrations();
  const pending = [
    '20240101_core_schema',
    '20240601_schema_updates',
    '20241001_equipment_tables',
    '20241101_film_structure',
    '20241201_roll_display_seq'
  ].filter(async name => !(await hasMigrationRun(name)));
  
  return {
    executed,
    pending,
    summary: {
      total: 5,
      executed: executed.filter(m => m.success).length,
      failed: executed.filter(m => !m.success).length
    }
  };
}

module.exports = {
  runAllMigrations,
  getMigrationStatus
};
