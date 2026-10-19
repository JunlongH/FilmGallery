'use strict';

const { isLoopback } = require('./network');

function tokenFromRequest(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (match) return match[1];
  const cookie = req.get('cookie') || '';
  const cookieMatch = /(?:^|;\s*)fg_session=([^;]+)/.exec(cookie);
  if (!cookieMatch) return null;
  try { return decodeURIComponent(cookieMatch[1]); } catch (_) { return null; }
}

function isPublicAuthPath(req) {
  return /^\/api\/auth\/(?:login|setup|status)$/.test(req.path) || req.path === '/api/discover' || /^\/api\/health\/?$/.test(req.path);
}

function createAuthMiddleware({ accountStore, allowPublicRoutes = true, allowLoopback = true }) {
  if (!accountStore) throw new TypeError('accountStore is required');
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Keep loopback bypass opt-in only. A local tunnel connector also appears
    // as loopback, so the production server passes allowLoopback: false.
    if (allowLoopback && isLoopback(req.ip || (req.socket && req.socket.remoteAddress))) {
      const token = tokenFromRequest(req);
      if (token) req.auth = { token };
      return next();
    }
    if (allowPublicRoutes && isPublicAuthPath(req)) return next();
    const token = tokenFromRequest(req);
    let validSession = false;
    try { validSession = !!(token && accountStore.verifySession(token)); } catch (_) {
      return res.status(503).json({ ok: false, error: 'Authentication unavailable' });
    }
    if (validSession) {
      req.auth = { token };
      return next();
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  };
}

module.exports = { createAuthMiddleware, tokenFromRequest };
