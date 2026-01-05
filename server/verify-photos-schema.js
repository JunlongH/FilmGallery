// Verify photos table schema
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getDbPath } = require('./config/db-config');

const dbPath = getDbPath();
console.log(`\n[VERIFY] Checking photos table schema in: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[VERIFY] Failed to open database:', err);
    process.exit(1);
  }
});

// Required columns for photos table
const requiredColumns = [
  'id', 'roll_id', 'filename', 'path',
  'aperture', 'shutter_speed', 'iso', 'focal_length',
  'frame_number', 'full_rel_path', 'thumb_rel_path',
  'negative_rel_path', 'original_rel_path',
  'positive_rel_path', 'positive_thumb_rel_path', 'negative_thumb_rel_path',
  'is_negative_source', 'taken_at', 'date_taken', 'time_taken',
  'location_id', 'detail_location',
  'camera', 'lens', 'photographer', 'edit_params',
  'rating', 'notes', 'created_at'
];

db.all('PRAGMA table_info(photos)', (err, rows) => {
  if (err) {
    console.error('[VERIFY] Failed to get table info:', err);
    db.close();
    process.exit(1);
  }

  const existingColumns = rows.map(row => row.name);
  
  console.log('[VERIFY] Current photos table columns:\n');
  rows.forEach((row, index) => {
    const marker = requiredColumns.includes(row.name) ? '✓' : '?';
    console.log(`  ${marker} ${(index + 1).toString().padStart(2, ' ')}. ${row.name.padEnd(30)} ${row.type}`);
  });

  console.log('\n[VERIFY] Column check:\n');
  
  const missing = requiredColumns.filter(col => !existingColumns.includes(col));
  const extra = existingColumns.filter(col => !requiredColumns.includes(col));

  if (missing.length === 0) {
    console.log('  ✓ All required columns present!');
  } else {
    console.log('  ✗ Missing columns:');
    missing.forEach(col => console.log(`    - ${col}`));
  }

  if (extra.length > 0) {
    console.log('\n  ℹ Extra columns (not in required list):');
    extra.forEach(col => console.log(`    + ${col}`));
  }

  console.log('\n[VERIFY] Summary:');
  console.log(`  Total columns:    ${existingColumns.length}`);
  console.log(`  Required:         ${requiredColumns.length}`);
  console.log(`  Missing:          ${missing.length}`);
  console.log(`  Status:           ${missing.length === 0 ? '✓ PASS' : '✗ FAIL'}`);
  
  console.log('\n');
  
  db.close((err) => {
    if (err) console.error('[VERIFY] Error closing database:', err);
    process.exit(missing.length === 0 ? 0 : 1);
  });
});
