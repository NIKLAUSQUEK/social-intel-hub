/**
 * Shared security utilities
 */

import { randomUUID } from 'crypto';

// Strict clientId validation — alphanumeric, hyphens, underscores only
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function validateClientId(clientId) {
  if (!clientId || typeof clientId !== 'string') return false;
  if (clientId.length > 64) return false;
  return CLIENT_ID_RE.test(clientId);
}

// Middleware: validate :id param on all routes
export function clientIdGuard(req, res, next) {
  const id = req.params.id;
  if (id && !validateClientId(id)) {
    return res.status(400).json({ success: false, error: 'Invalid client ID' });
  }
  next();
}

// Sanitise error messages — never expose internal paths or stack traces
export function safeError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  // Strip file paths (Windows and Unix)
  return msg
    .replace(/[A-Z]:\\[^\s:]+/gi, '[path]')
    .replace(/\/[^\s:]+\.(js|json|ts)/gi, '[path]')
    .slice(0, 200);
}

// Generate collision-resistant IDs
export function generateId(prefix) {
  return (prefix || '') + randomUUID().slice(0, 12);
}
