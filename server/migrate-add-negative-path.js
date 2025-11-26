const db = require('./db');

(async () => {
  try {
    console.log('Migrating: Adding negative_rel_path to photos table...');
    
    // Check if column exists
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(photos)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const hasColumn = tableInfo.some(col => col.name === 'negative_rel_path');

    if (!hasColumn) {
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE photos ADD COLUMN negative_rel_path TEXT", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('Column negative_rel_path added successfully.');
    } else {
      console.log('Column negative_rel_path already exists.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
  }
})();
