const path = require('path');
const fs = require('fs');

let uploadsDir;
// Highest priority: explicit DATA_ROOT (new standard)
if (process.env.DATA_ROOT) {
  uploadsDir = path.join(process.env.DATA_ROOT, 'uploads');
} 
// Legacy/Specific override: explicit UPLOADS_ROOT points directly to the storage root
else if (process.env.UPLOADS_ROOT) {
  uploadsDir = process.env.UPLOADS_ROOT;
} else if (process.env.USER_DATA) {
  // Fallback to userData/uploads
  uploadsDir = path.join(process.env.USER_DATA, 'uploads');
} else {
  // Dev fallback inside repo
  uploadsDir = path.join(__dirname, '../uploads');
}

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const tmpUploadDir = path.join(uploadsDir, 'tmp');
if (!fs.existsSync(tmpUploadDir)) fs.mkdirSync(tmpUploadDir, { recursive: true });

const rollsDir = path.join(uploadsDir, 'rolls');
if (!fs.existsSync(rollsDir)) fs.mkdirSync(rollsDir, { recursive: true });

const filmDir = path.join(uploadsDir, 'films');
if (!fs.existsSync(filmDir)) fs.mkdirSync(filmDir, { recursive: true });

module.exports = { uploadsDir, tmpUploadDir, rollsDir, filmDir };
