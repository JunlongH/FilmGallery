'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { validatePassword } = require('../utils/auth-account');

function isLoopback(value) {
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function isTrustedSetupRequest(req) {
  const address = req.socket && req.socket.remoteAddress;
  if (!isLoopback(address) && address !== '::ffff:127.0.0.1') return false;
  if (Object.keys(req.headers || {}).some(name => /^(?:forwarded|x-forwarded-|x-real-ip)/i.test(name))) return false;
  try {
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (!isLoopback(host)) return false;
    // Electron's file:// renderer serializes its opaque origin as either
    // `null` or `file://`; the socket is already restricted to loopback.
    if (!req.headers.origin || req.headers.origin === 'null' || req.headers.origin === 'file://') return true;
    const origin = new URL(req.headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) && isLoopback(origin.hostname);
  } catch (_) {
    return false;
  }
}

function createAuthSettingsRouter({ accountStore }) {
  if (!accountStore) throw new TypeError('accountStore is required');
  const router = express.Router();
  router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  router.get('/status', (req, res) => {
    try { return res.json({ ok: true, configured: accountStore.isConfigured() }); }
    catch (_) { return res.status(503).json({ ok: false, error: 'Authentication unavailable' }); }
  });

  router.post('/setup', (req, res) => {
    if (!isTrustedSetupRequest(req)) return res.status(404).json({ ok: false, error: 'Not found' });
    try {
      if (accountStore.isConfigured()) return res.status(404).json({ ok: false, error: 'Not found' });
      validatePassword(req.body && req.body.password);
      accountStore.setPassword(req.body.password, req.body.username);
      return res.status(201).json({ ok: true });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many login attempts, please try again later.' }
  });

  const sessionCookie = (req, token, maxAge) => {
    const forwardedProto = req.get ? req.get('x-forwarded-proto') : req.headers && req.headers['x-forwarded-proto'];
    const secure = process.env.FG_COOKIE_SECURE === '1' || req.secure || forwardedProto === 'https';
    return `fg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`;
  };

  router.post('/login', loginLimiter, (req, res) => {
    let valid = false;
    try { valid = accountStore.verifyCredentials(req.body && req.body.username, req.body && req.body.password); } catch (_) {
      return res.status(503).json({ ok: false, error: 'Authentication unavailable' });
    }
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    const session = accountStore.createSession();
    res.setHeader('Set-Cookie', sessionCookie(req, session.token, session.expiresIn));
    return res.json({ ok: true, token: session.token, expiresIn: session.expiresIn });
  });

  router.post('/logout', (req, res) => {
    const token = req.auth && req.auth.token;
    if (token) accountStore.revokeSession(token);
    const forwardedProto = req.get ? req.get('x-forwarded-proto') : req.headers && req.headers['x-forwarded-proto'];
    const secure = process.env.FG_COOKIE_SECURE === '1' || req.secure || forwardedProto === 'https';
    res.setHeader('Set-Cookie', `fg_session=; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=0${secure ? '; Secure' : ''}`);
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createAuthSettingsRouter, isTrustedSetupRequest };
