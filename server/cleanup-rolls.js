#!/usr/bin/env node
// cleanup-rolls.js
// - Deletes DB roll rows whose upload folder is missing
// - Deletes upload roll folders that have no DB roll

const fs = require('fs');
const path = require('path');
const db = require('./db');

const uploadsDir = path.join(__dirname, 'uploads');
const rollsDir = path.join(uploadsDir, 'rolls');

function listDiskRollFolders() {
  if (!fs.existsSync(rollsDir)) return [];
  return fs.readdirSync(rollsDir).filter(name => {
    const p = path.join(rollsDir, name);
    return fs.statSync(p).isDirectory();
  });
}

function getDbRolls() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, title FROM rolls', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function deleteRollFromDb(rollId) {
  return new Promise((resolve, reject) => {
    // delete photos then roll (photos should have FOREIGN KEY CASCADE if configured)
    db.run('DELETE FROM photos WHERE roll_id = ?', [rollId], function(err) {
      if (err) return reject(err);
      db.run('DELETE FROM rolls WHERE id = ?', [rollId], function(err2) {
        if (err2) return reject(err2);
        resolve({ photosDeleted: this.changes });
      });
    });
  });
}

function rimrafDir(dirPath) {
  if (!fs.existsSync(dirPath)) return false;
  // recursively delete
  fs.rmSync(dirPath, { recursive: true, force: true });
  return true;
}

async function run() {
  try {
    console.log('Starting rolls cleanup...');

    const diskFolders = listDiskRollFolders();
    console.log('Disk roll folders:', diskFolders.length);

    const dbRolls = await getDbRolls();
    const dbRollIds = dbRolls.map(r => String(r.id));
    console.log('DB rolls:', dbRollIds.length);

    // 1) Delete DB rolls whose folder is missing
    const rollsMissingFolder = dbRollIds.filter(id => !diskFolders.includes(id));
    console.log('DB rolls with missing folders:', rollsMissingFolder.length ? rollsMissingFolder.join(', ') : '(none)');
    for (const id of rollsMissingFolder) {
      console.log(`Deleting roll ${id} from DB (folder missing)`);
      await deleteRollFromDb(id);
    }

    // 2) Remove disk folders that have no DB roll
    const orphanDiskFolders = diskFolders.filter(f => !dbRollIds.includes(f));
    console.log('Disk folders without DB roll:', orphanDiskFolders.length ? orphanDiskFolders.join(', ') : '(none)');
    for (const f of orphanDiskFolders) {
      const dir = path.join(rollsDir, f);
      console.log(`Removing orphan folder ${dir}`);
      rimrafDir(dir);
    }

    console.log('Cleanup finished.');
    process.exit(0);
  } catch (err) {
    console.error('Cleanup error:', err);
    process.exit(2);
  }
}

if (require.main === module) run();
