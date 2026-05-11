#!/usr/bin/env node
/**
 * One-off backfill: synthesise scrape-health.json for clients that have only
 * legacy freshness data. Reads each client's metrics-latest.json + posts-latest.json,
 * classifies the platform health using the same logic as scraper/index.js, and
 * writes a one-attempt scrape-health.json so the dashboard shows tri-state
 * immediately without waiting for a fresh scrape.
 *
 * Usage:  node scripts/backfill-scrape-health.js
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

const FIELDS_EXPECTED = {
  instagram: ['followers', 'bio', 'posts', 'views', 'likes', 'comments'],
  tiktok:    ['followers', 'bio', 'posts', 'views', 'likes', 'comments'],
  facebook:  ['followers', 'bio', 'posts', 'likes', 'comments'],
  linkedin:  ['followers', 'bio', 'posts', 'likes', 'comments'],
};

function classifyHealth(data, platformPosts) {
  if (!data || data.success === false) return 'failed';
  const followers = data.followers ?? data.pageLikes ?? 0;
  const postCount = Array.isArray(platformPosts) ? platformPosts.length : 0;
  const hasEngagement = postCount > 0 && platformPosts.some(p =>
    (p.views ?? 0) > 0 || (p.likes ?? 0) > 0 || (p.comments ?? 0) > 0
  );
  if (followers > 0 && postCount > 0 && hasEngagement) return 'healthy';
  return 'partial';
}

function fieldsReturned(data, platformPosts) {
  const fields = [];
  if (data?.followers != null && data.followers > 0) fields.push('followers');
  if (data?.bio) fields.push('bio');
  if (Array.isArray(platformPosts) && platformPosts.length > 0) fields.push('posts');
  if (Array.isArray(platformPosts) && platformPosts.some(p => (p.views ?? 0) > 0)) fields.push('views');
  if (Array.isArray(platformPosts) && platformPosts.some(p => (p.likes ?? 0) > 0)) fields.push('likes');
  if (Array.isArray(platformPosts) && platformPosts.some(p => (p.comments ?? 0) > 0)) fields.push('comments');
  return fields;
}

function readJsonSafe(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

let processed = 0, updated = 0, skipped = 0;
const summary = { healthy: 0, partial: 0, failed: 0 };

for (const dirent of readdirSync(DATA_DIR)) {
  const clientDir = join(DATA_DIR, dirent);
  if (!statSync(clientDir).isDirectory()) continue;
  processed++;

  const metricsPath = join(clientDir, 'metrics-latest.json');
  const postsPath = join(clientDir, 'posts-latest.json');
  const healthPath = join(clientDir, 'scrape-health.json');
  if (!existsSync(metricsPath)) { skipped++; continue; }
  // Don't overwrite a real (multi-attempt) log
  if (existsSync(healthPath)) {
    const existing = readJsonSafe(healthPath);
    const totalAttempts = Object.values(existing?.perPlatform || {})
      .reduce((s, p) => s + (p.attempts?.length || 0), 0);
    if (totalAttempts > 1) { skipped++; continue; }
  }

  const metrics = readJsonSafe(metricsPath);
  const posts = readJsonSafe(postsPath);
  if (!metrics) { skipped++; continue; }
  const scrapedAt = metrics.scrapedAt || new Date().toISOString();

  const log = { perPlatform: {} };
  for (const [key, data] of Object.entries(metrics.platforms || {})) {
    const platformPosts = posts?.platforms?.[key] || [];
    const status = classifyHealth(data, platformPosts);
    const got = fieldsReturned(data, platformPosts);
    summary[status] = (summary[status] || 0) + 1;
    log.perPlatform[key] = {
      attempts: [{
        ts: scrapedAt,
        status,
        error: data?.error || null,
        fields_returned: got,
        missing_fields: (FIELDS_EXPECTED[key] || []).filter(f => !got.includes(f)),
        mode: 'backfill',
      }],
      last_success: status === 'healthy' ? scrapedAt : null,
      last_attempt: scrapedAt,
      last_status: status,
      reliability_30d_pct: status === 'healthy' ? 100 : 0,
    };
  }
  writeFileSync(healthPath, JSON.stringify(log, null, 2));
  updated++;
}

console.log(`✓ backfill complete`);
console.log(`  processed: ${processed} clients`);
console.log(`  updated:   ${updated}`);
console.log(`  skipped:   ${skipped}`);
console.log(`  platforms: ${summary.healthy} healthy · ${summary.partial} partial · ${summary.failed} failed`);
