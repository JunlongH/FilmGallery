const fs = require('fs');
const path = require('path');
const db = require('./db');
const { uploadsDir, rollsDir } = require('./config/paths');

async function migrate() {
  console.log('Starting migration of negatives to separate folder...');

  db.all('SELECT id, roll_id, negative_rel_path FROM photos WHERE negative_rel_path IS NOT NULL', [], async (err, rows) => {
    if (err) {
      console.error('DB Error:', err);
      return;
    }

    console.log(`Found ${rows.length} photos with negatives.`);

    for (const row of rows) {
      const oldRelPath = row.negative_rel_path;
      // Check if it's already in a 'negative' folder
      if (oldRelPath.includes('/negative/')) {
        console.log(`Skipping ${row.id}, already migrated.`);
        continue;
      }

      const oldAbsPath = path.join(uploadsDir, oldRelPath);
      
      if (!fs.existsSync(oldAbsPath)) {
        console.warn(`File not found for photo ${row.id}: ${oldAbsPath}`);
        continue;
      }

      // Construct new path
      // Assumes old path is like: rolls/<id>/full/<name>_neg.jpg
      // We want: rolls/<id>/negative/<name>_neg.jpg
      
      const pathParts = oldRelPath.split('/');
      // pathParts should be ['rolls', '123', 'full', 'name_neg.jpg']
      
      if (pathParts.length < 4 || pathParts[2] !== 'full') {
        console.warn(`Unexpected path format for ${row.id}: ${oldRelPath}`);
        continue;
      }

      const rollId = pathParts[1];
      const fileName = pathParts[pathParts.length - 1];
      
      const newRelDir = path.join('rolls', rollId, 'negative').replace(/\\/g, '/');
      const newAbsDir = path.join(uploadsDir, newRelDir);
      const newRelPath = path.join(newRelDir, fileName).replace(/\\/g, '/');
      const newAbsPath = path.join(newAbsDir, fileName);

      try {
        if (!fs.existsSync(newAbsDir)) {
          fs.mkdirSync(newAbsDir, { recursive: true });
        }

        fs.renameSync(oldAbsPath, newAbsPath);
        
        await new Promise((resolve, reject) => {
          db.run('UPDATE photos SET negative_rel_path = ? WHERE id = ?', [newRelPath, row.id], (updateErr) => {
            if (updateErr) reject(updateErr);
            else resolve();
          });
        });

        console.log(`Migrated ${row.id}: ${oldRelPath} -> ${newRelPath}`);
      } catch (e) {
        console.error(`Failed to migrate ${row.id}:`, e);
      }
    }
    console.log('Migration complete.');
  });
}

migrate();
