const path = require('path');
const fs = require('fs');

function isUsableEnvValue(v) {
  if (!v || typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return false;
  return true;
}

function getDbPath() {
  let dbPath;

  // Highest priority: explicit DB_PATH (scripts / power users)
  if (isUsableEnvValue(process.env.DB_PATH)) {
    dbPath = process.env.DB_PATH.trim();
  } else if (isUsableEnvValue(process.env.DATA_ROOT)) {
    // Highest priority: custom data root
    dbPath = path.join(process.env.DATA_ROOT.trim(), 'film.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } else if (isUsableEnvValue(process.env.USER_DATA)) {
    // prefer electron userData folder if provided via env
    dbPath = path.join(process.env.USER_DATA.trim(), 'film.db');
    // ensure folder exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } else {
    dbPath = path.join(__dirname, '../film.db');
  }

  // If DB_PATH points to a file inside a folder that doesn't exist yet
  try {
    const dir = path.dirname(dbPath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* ignore - directory may already exist */ }

  return dbPath;
}

module.exports = {
  getDbPath
};
