'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const Module = require('node:module');
const { createAuthStore } = require('./auth-account');
const { createAuthMiddleware } = require('./auth');

function fakeResponse() {
  return {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function routerWithStubs() {
  const routes = new Map();
  const router = {
    use(handler) { this.useHandler = handler; },
    get(route, ...handlers) { routes.set(`GET ${route}`, handlers); },
    post(route, ...handlers) { routes.set(`POST ${route}`, handlers); }
  };
  const authSettingsPath = require.resolve('../routes/auth-settings');
  const authSettingsModule = new Module(authSettingsPath, module);
  authSettingsModule.filename = authSettingsPath;
  authSettingsModule.paths = module.paths;
  const originalRequire = authSettingsModule.require.bind(authSettingsModule);
  authSettingsModule.require = name => {
    if (name === 'express') return { Router: () => router };
    if (name === 'express-rate-limit') return () => (_req, _res, next) => next();
    return originalRequire(name);
  };
  authSettingsModule._compile(fs.readFileSync(authSettingsPath, 'utf8'), authSettingsPath);
  return { routes, router, ...authSettingsModule.exports };
}

function invoke(handlers, req) {
  const res = fakeResponse();
  let i = 0;
  const next = () => { if (handlers[i]) handlers[i++](req, res, next); };
  next();
  return res;
}

test('password, username, logout, change, restart, corrupt account and uploads guard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filmgallery-auth-test-'));
  try {
    const file = path.join(dir, 'account.json');
    const store = createAuthStore({ file });
    const { routes, router, createAuthSettingsRouter, isTrustedSetupRequest } = routerWithStubs();
    createAuthSettingsRouter({ accountStore: store });
    const localRequest = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:4000' }, body: { username: 'alice', password: 'correct horse battery staple' } };
    assert.equal(isTrustedSetupRequest(localRequest), true);
    assert.equal(isTrustedSetupRequest({ ...localRequest, headers: { ...localRequest.headers, origin: 'null' } }), true);
    assert.equal(isTrustedSetupRequest({ ...localRequest, headers: { ...localRequest.headers, origin: 'file://' } }), true);
    assert.equal(isTrustedSetupRequest({ ...localRequest, headers: { ...localRequest.headers, origin: 'https://evil.example' } }), false);
    assert.equal(isTrustedSetupRequest({ ...localRequest, headers: { ...localRequest.headers, forwarded: 'for=evil' } }), false);
    assert.equal(invoke(routes.get('POST /setup'), localRequest).statusCode, 201);
    const login = body => invoke(routes.get('POST /login'), { body });
    assert.equal(login({ username: 'alice', password: 'wrong password' }).statusCode, 401);
    assert.equal(login({ username: 'other', password: localRequest.body.password }).statusCode, 401);
    const first = login(localRequest.body);
    assert.equal(first.statusCode, 200);
    assert.equal(store.verifySession(first.body.token), true);
    const auth = createAuthMiddleware({ accountStore: store, allowPublicRoutes: false, allowLoopback: false });
    for (const requestPath of ['/api/health', '/uploads/photo.jpg']) {
      const uploadReq = { path: requestPath, get: () => '' };
      let passed = false;
      const denied = fakeResponse();
      auth(uploadReq, denied, () => { passed = true; });
      assert.equal(passed, false);
      assert.equal(denied.statusCode, 401);
      assert.equal(denied.headers['cache-control'], 'no-store');
    }
    assert.equal(invoke(routes.get('POST /logout'), { auth: { token: first.body.token } }).statusCode, 200);
    assert.equal(store.verifySession(first.body.token), false);
    const second = login(localRequest.body).body.token;
    store.setPassword('another correct password', 'alice');
    assert.equal(store.verifySession(second), false);
    assert.equal(login(localRequest.body).statusCode, 401);
    const third = login({ username: 'alice', password: 'another correct password' }).body.token;
    assert.equal(createAuthStore({ file }).verifySession(third), false);
    fs.writeFileSync(file, JSON.stringify({ username: 'alice', version: 1, salt: '', hash: '' }));
    assert.throws(() => store.isConfigured(), /Invalid auth account file/);
    assert.throws(() => store.verifyCredentials('alice', 'another correct password'), /Invalid auth account file/);
    assert.throws(() => store.verifySession(third), /Invalid auth account file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

