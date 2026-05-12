#!/usr/bin/env node
/**
 * A15 — SLA watchdog. Runs from cron (or manually) to:
 *   1. Pull the freshness audit for every active client
 *   2. Fire a Telegram notification (via pushNotification → telegram routing)
 *      whenever a client crosses into `breach` or `critical` and we haven't
 *      already pinged about that specific tier in the last 24 hours.
 *
 * Usage:
 *   node scripts/sla-watch.js                 # walk all clients, fire notifications
 *   node scripts/sla-watch.js --dry-run       # report only, don't send
 *
 * Suggested cron: once per day, 9am SGT.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '..', '.env.local') });

const { pushNotification } = await import('../notifications/service.js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Track last-notified tier per client so we don't spam
const stateFile = join(ROOT, 'logs', 'sla-watch-state.json');
let state = {};
if (existsSync(stateFile)) {
  try { state = JSON.parse(readFileSync(stateFile, 'utf-8')); } catch {}
}

async function fetchFreshness() {
  // Call our own API
  const port = process.env.PORT || 3099;
  const url = `http://localhost:${port}/api/clients/freshness/all`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'no data');
    return j.data.clients;
  } catch (err) {
    console.error('✗ Failed to fetch freshness — is the server running?', err.message);
    process.exit(1);
  }
}

const tierLabels = {
  warn: '🟡 SLA warning',
  breach: '🟠 SLA BREACHED',
  critical: '🔴 SLA CRITICAL',
};
const priorityForTier = { warn: 'info', breach: 'warn', critical: 'error' };

const clients = await fetchFreshness();
let pinged = 0, skipped = 0;
const now = Date.now();
const minIntervalMs = 24 * 3600 * 1000;

for (const c of clients) {
  const tier = c.slaStatus;
  if (!['warn', 'breach', 'critical'].includes(tier)) continue;
  const key = c.id;
  const last = state[key];
  if (last?.tier === tier && (now - last.ts) < minIntervalMs) {
    skipped++;
    continue;
  }
  const platformBreakdown = Object.entries(c.perPlatform || {})
    .filter(([, p]) => p.ageDays != null)
    .map(([pf, p]) => `${pf}: ${p.ageDays}d ago${p.status !== 'healthy' ? ' (' + p.status + ')' : ''}`)
    .join(', ');
  const title = `${tierLabels[tier]} — ${c.name}`;
  const body = `Last scrape: ${c.ageDays} days ago (SLA: ${c.slaDays}d).\n${platformBreakdown || 'No platform health data.'}`;
  if (dryRun) {
    console.log(`◇ would notify: ${title}\n  ${body}`);
  } else {
    pushNotification(c.id, {
      title,
      body,
      priority: priorityForTier[tier],
      link: `/#overview/${c.id}`,
      meta: { source: 'sla-watch', tier, ageDays: c.ageDays, slaDays: c.slaDays },
    });
    state[key] = { tier, ts: now };
    pinged++;
  }
}

if (!dryRun) {
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

console.log(`✓ SLA watch complete · pinged ${pinged} · skipped ${skipped} (recently alerted) · total active ${clients.length}`);
