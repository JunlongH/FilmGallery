#!/usr/bin/env node
const db = require('./db');

const statements = `
PRAGMA foreign_keys = ON;

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
`;

db.exec(statements, (err) => {
  if (err) {
    console.error('Failed to ensure tags schema:', err.message);
    process.exit(1);
  }
  console.log('Tags schema ensured.');
  db.close();
});