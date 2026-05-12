/**
 * B2 — In-memory metric cache with TTL.
 *
 * Wraps any reader function in a per-key cache. Used to avoid re-reading the
 * same metrics-latest.json on every dashboard render across tabs. Cache is
 * invalidated when a fresh scrape lands (via bustClient()).
 *
 * Usage:
 *   import { cached, bustClient } from '../lib/metric-cache.js';
 *   const data = cached(`metrics:${clientId}`, () => readFile(...), 60_000);
 *   bustClient(clientId);  // after scrape completes
 */

const _cache = new Map(); // key -> { value, expiresAt }

export function cached(key, loader, ttlMs = 60_000) {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = loader();
  _cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function bust(key) { _cache.delete(key); }

export function bustClient(clientId) {
  // Drop every cached entry whose key contains this client id
  for (const k of _cache.keys()) {
    if (k.includes(':' + clientId) || k.endsWith(clientId)) _cache.delete(k);
  }
}

export function snapshot() {
  return {
    keys: _cache.size,
    sample: [..._cache.keys()].slice(0, 10),
  };
}
