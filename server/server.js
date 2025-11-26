const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const sharp = require('sharp');
const db = require('./db');
// Disable sharp cache to prevent file locking on Windows
sharp.cache(false);
const { uploadsDir, tmpUploadDir, rollsDir } = require('./config/paths');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
// CORS: reflect origin (including 'null' from file://) and allow private network
// Important: preflightContinue=true so we can add Access-Control-Allow-Private-Network on OPTIONS
app.use(cors({ origin: true, credentials: false, preflightContinue: true }));
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	next();
});
// Ensure OPTIONS preflight includes the Private-Network header
app.options('*', (req, res) => {
	res.setHeader('Access-Control-Allow-Private-Network', 'true');
	res.sendStatus(204);
});

// --- storage directories ---
// Cache static files for 1 year (immutable) since filenames usually don't change or are unique
const staticOptions = {
  maxAge: '1y',
  immutable: true,
  etag: true,
  lastModified: true
};

app.use('/uploads', express.static(uploadsDir, staticOptions));
app.use('/uploads/tmp', express.static(tmpUploadDir)); // tmp files don't need long cache
app.use('/uploads/rolls', express.static(rollsDir, staticOptions));

// --- Routes (mount after schema is ensured just before listen) ---
const mountRoutes = () => {
	app.use('/api/rolls', require('./routes/rolls'));
	app.use('/api/photos', require('./routes/photos'));
	app.use('/api/films', require('./routes/films'));
	app.use('/api/tags', require('./routes/tags'));
	app.use('/api/uploads', require('./routes/uploads'));
	app.use('/api/metadata', require('./routes/metadata'));
	app.use('/api/search', require('./routes/search'));
	app.use('/api/presets', require('./routes/presets'));
};

// Ensure database schema exists before accepting requests (first-run install)
const schemaSQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS films (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	iso INTEGER NOT NULL,
	category TEXT NOT NULL,
	thumbPath TEXT,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rolls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT,
	start_date TEXT,
	end_date TEXT,
	camera TEXT,
	lens TEXT,
	shooter TEXT,
	filmId INTEGER,
	film_type TEXT,
	exposures INTEGER,
	cover_photo TEXT,
	coverPath TEXT,
	folderName TEXT,
	iso INTEGER,
	notes TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (filmId) REFERENCES films(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS photos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	roll_id INTEGER NOT NULL,
	frame_number TEXT,
	filename TEXT,
	full_rel_path TEXT,
	thumb_rel_path TEXT,
	caption TEXT,
	taken_at TEXT,
	rating INTEGER,
	negative_rel_path TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS photo_tags (
	photo_id INTEGER NOT NULL,
	tag_id INTEGER NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (photo_id, tag_id),
	FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
	FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS roll_files (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	rollId INTEGER NOT NULL,
	filename TEXT NOT NULL,
	relPath TEXT NOT NULL,
	createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (rollId) REFERENCES rolls(id) ON DELETE CASCADE
);
 
CREATE TABLE IF NOT EXISTS presets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	category TEXT,
	description TEXT,
	params_json TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

function ensureSchema() {
	return new Promise((resolve, reject) => {
		db.exec(schemaSQL, (err) => {
			if (err) return reject(err);
			resolve(true);
		});
	});
}

async function verifySchemaTables() {
	return new Promise((resolve) => {
		db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
			if (err) { console.error('Schema check failed', err.message); return resolve(false); }
			const existing = new Set(rows.map(r => r.name));
			const required = ['films','rolls','photos','tags','photo_tags','roll_files','presets'];
			const missing = required.filter(t => !existing.has(t));
			if (missing.length === 0) return resolve(true);
			console.warn('Missing tables detected, creating:', missing.join(', '));
			ensureSchema().then(() => resolve(true)).catch(e => { console.error('Recreate schema failed', e.message); resolve(false); });
		});
	});
}

// Ensure additional columns (non-breaking migrations) without separate migration files.
function ensureExtraColumns() {
    // Add preset_json column to rolls if missing
    db.all("PRAGMA table_info(rolls)", (err, cols) => {
        if (err) { console.error('Failed to inspect rolls table', err.message); return; }
        const hasPreset = cols.some(c => c.name === 'preset_json');
        if (!hasPreset) {
            console.log('[MIGRATION] Adding preset_json column to rolls');
            db.run('ALTER TABLE rolls ADD COLUMN preset_json TEXT', (e) => {
                if (e) console.error('Failed adding preset_json column', e.message); else console.log('[MIGRATION] preset_json column added');
            });
        }
    });
}

(async () => {
	try {
		await verifySchemaTables();
		ensureExtraColumns();
		mountRoutes();
		const PORT = process.env.PORT || 4000;
		// Listen on all interfaces (0.0.0.0) to allow mobile access
		app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
	} catch (e) {
		console.error('Failed to ensure DB schema', e);
		process.exit(1);
	}
})();
