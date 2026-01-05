const path = require('path');
const fs = require('fs');
const os = require('os');

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

// Local temp dir (must NOT be inside OneDrive / cloud-synced storage).
// Used for Multer uploads and Sharp processing to avoid file-lock contention.
const localTmpRoot = process.env.LOCAL_TMP_ROOT
  ? process.env.LOCAL_TMP_ROOT
  : path.join(os.tmpdir(), 'FilmGallery');

const localTmpDir = path.join(localTmpRoot, 'uploads-tmp');
if (!fs.existsSync(localTmpDir)) fs.mkdirSync(localTmpDir, { recursive: true });

const rollsDir = path.join(uploadsDir, 'rolls');
if (!fs.existsSync(rollsDir)) fs.mkdirSync(rollsDir, { recursive: true });

const filmDir = path.join(uploadsDir, 'films');
if (!fs.existsSync(filmDir)) fs.mkdirSync(filmDir, { recursive: true });

module.exports = { uploadsDir, tmpUploadDir, localTmpDir, rollsDir, filmDir };
