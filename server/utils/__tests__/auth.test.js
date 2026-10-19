const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAuthStore } = require('../auth-account');
const { createAuthMiddleware } = require('../auth');

describe('account password authentication', () => {
  test('requires valid credentials and invalidates sessions after logout/password change', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filmgallery-auth-jest-'));
    try {
      const file = path.join(dir, 'account.json');
      const store = createAuthStore({ file });
      store.setPassword('correct horse battery staple', 'alice');
      expect(store.verifyCredentials('alice', 'correct horse battery staple')).toBe(true);
      expect(store.verifyCredentials('alice', 'wrong password')).toBe(false);
      expect(store.verifyCredentials('other', 'correct horse battery staple')).toBe(false);
      const session = store.createSession();
      expect(store.verifySession(session.token)).toBe(true);
      store.revokeSession(session.token);
      expect(store.verifySession(session.token)).toBe(false);
      const old = store.createSession().token;
      store.setPassword('another correct password', 'alice');
      expect(store.verifySession(old)).toBe(false);
      expect(createAuthStore({ file }).verifySession(old)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('protects mounted upload paths even when public API paths are enabled', () => {
    const store = createAuthStore({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'filmgallery-auth-')), 'account.json') });
    const auth = createAuthMiddleware({ accountStore: store, allowPublicRoutes: false, allowLoopback: false });
    for (const requestPath of ['/uploads/photo.jpg', '/api/health']) {
      const req = { path: requestPath, get: () => '', ip: '203.0.113.5' };
      const res = { headers: {}, status(code) { this.statusCode = code; return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, json(body) { this.body = body; } };
      let passed = false;
      auth(req, res, () => { passed = true; });
      expect(passed).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});
