'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PASSWORD_MIN_LENGTH = 12;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function accountPath() {
  return process.env.AUTH_ACCOUNT_FILE || path.join(
    process.env.USER_DATA || process.env.DATA_ROOT || process.cwd(),
    'auth-account.json'
  );
}

function readAccount(file = accountPath()) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const valid = value && value.version === 1
      && typeof value.username === 'string' && /^[^\s:]{1,64}$/.test(value.username)
      && typeof value.salt === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value.salt)
      && Buffer.from(value.salt, 'base64url').length === 16
      && typeof value.hash === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value.hash)
      && Buffer.from(value.hash, 'base64url').length === 64;
    if (!valid) throw new Error('Invalid auth account file');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function writeAccount(account, file = accountPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(account) + '\n', { mode: 0o600 });
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch (_) {}
    throw error;
  }
  try { fs.chmodSync(file, 0o600); } catch (_) {}
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  validatePassword(password);
  return {
    salt: Buffer.from(salt).toString('base64url'),
    hash: crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64url')
  };
}

function passwordMatches(password, account) {
  if (!account || typeof password !== 'string') return false;
  try {
    const expected = Buffer.from(account.hash, 'base64url');
    const actual = crypto.scryptSync(password, Buffer.from(account.salt, 'base64url'), expected.length, {
      N: 16384, r: 8, p: 1
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}

function createAuthStore(options = {}) {
  const file = options.file || accountPath();
  const sessionsFile = options.sessionsFile || path.join(path.dirname(file), 'auth-sessions.json');
  const defaultUsername = options.username || process.env.FG_ADMIN_USERNAME || 'admin';
  const sessions = new Map();

  // Sessions survive server restarts (desktop app quits kill the in-memory
  // store, otherwise every relaunch invalidates the client's saved token).
  try {
    const saved = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
    if (Array.isArray(saved)) {
      const now = Date.now();
      for (const [token, expiresAt] of saved) {
        if (typeof token === 'string' && typeof expiresAt === 'number' && expiresAt > now) {
          sessions.set(token, expiresAt);
        }
      }
    }
  } catch (_) {}

  const saveSessions = () => {
    try {
      const now = Date.now();
      const data = [...sessions.entries()].filter(([, expiresAt]) => expiresAt > now);
      fs.mkdirSync(path.dirname(sessionsFile), { recursive: true });
      const temp = `${sessionsFile}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
      fs.renameSync(temp, sessionsFile);
      try { fs.chmodSync(sessionsFile, 0o600); } catch (_) {}
    } catch (_) {}
  };

  const purgeSessions = () => {
    const now = Date.now();
    for (const [token, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(token);
  };

  return {
    file,
    isConfigured() { return !!readAccount(file); },
    setPassword(password, username = defaultUsername) {
      if (typeof username !== 'string' || !/^[^\s:]{1,64}$/.test(username)) throw new Error('Invalid username');
      const account = { username, ...hashPassword(password), version: 1, updatedAt: new Date().toISOString() };
      writeAccount(account, file);
      sessions.clear();
      saveSessions();
      return true;
    },
    verifyPassword(password) { return passwordMatches(password, readAccount(file)); },
    verifyCredentials(username, password) {
      const account = readAccount(file);
      return !!account && account.username === username && passwordMatches(password, account);
    },
    createSession() {
      purgeSessions();
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + SESSION_TTL_MS);
      saveSessions();
      return { token, expiresIn: SESSION_TTL_MS };
    },
    verifySession(token) {
      if (!readAccount(file)) return false;
      purgeSessions();
      const expiresAt = sessions.get(token);
      return !!expiresAt && expiresAt > Date.now();
    },
    revokeSession(token) { sessions.delete(token); saveSessions(); },
    // Keep bootstrap explicit: no generated or logged password is ever used.
    ensureConfigured() {
      if (this.isConfigured()) return true;
      const bootstrap = process.env.FG_ADMIN_PASSWORD;
      if (!bootstrap) return false;
      this.setPassword(bootstrap, defaultUsername);
      return true;
    }
  };
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  SESSION_TTL_MS,
  accountPath,
  createAuthStore,
  hashPassword,
  passwordMatches,
  validatePassword
};

