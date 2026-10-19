/**
 * Account/password authentication.
 *
 * Server-side endpoints:
 *   GET    /api/auth/status             — report account setup status
 *   POST   /api/auth/setup              — first-run local account setup
 *   POST   /api/auth/login              — exchange username/password for a session
 *   POST   /api/auth/logout             — revoke the current session
 */
import { jsonFetch, postJson } from './core';

export function getAuthStatus() {
  return jsonFetch('/api/auth/status');
}

export function setupAccount(username, password) {
  return postJson('/api/auth/setup', { username, password });
}

export function login(username, password) {
  return postJson('/api/auth/login', { username, password });
}

export function logout() {
  return postJson('/api/auth/logout', {});
}
