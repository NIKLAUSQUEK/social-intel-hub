#!/usr/bin/env node
/**
 * Backfill content classifications for all active clients.
 *
 * Strategy:
 *   1. Load each client's posts-latest.json + classifications.json
 *   2. Compute delta (posts NOT yet classified — keyed by URL)
 *   3. Call classifyPosts() ONLY on the delta
 *   4. Merge new + existing, save back
 *
 * Routes through the cheap LLM tier (DeepSeek first) via the 'classify' label.
 * Skips clients with full coverage. Reports per-client stats and aggregate cost.
 *
 * Usage:
 *   node scripts/backfill-classifications.js                  # all clients
 *   node scripts/backfill-classifications.js --client X       # single
 *   node scripts/backfill-classifications.js --max-per 30     # cap classifications per client
 *   node scripts/backfill-classifications.js --dry-run        # report deltas only, no LLM calls
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

// Load env BEFORE importing modules that depend on it
dotenv.config({ path: join(ROOT, '..', '.env.local') });

const { classifyPosts, loadClassifications, saveClassifications } = await import('../api/services/content-classifier.js');
const { callLLM } = await import('../api/lib/llm-v2.js');

const args = process.argv.slice(2);
const clientFilter = args.includes('--client') ? args[args.indexOf('--client') + 1] : null;
const maxPer = args.includes('--max-per') ? parseInt(args[args.indexOf('--max-per') + 1], 10) : null;
const dryRun = args.includes('--dry-run');

function readJsonSafe(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

const clients = readJsonSafe(join(ROOT, 'clients.json'))?.clients || [];
const targets = clientFilter ? clients.filter(c => c.id === clientFilter) : clients;

console.log(`Backfill scope: ${targets.length} client${targets.length !== 1 ? 's' : ''}${dryRun ? ' (DRY RUN — no LLM calls)' : ''}`);
if (maxPer) console.log(`Cap: ${maxPer} new classifications per client`);
console.log('');

let totalAdded = 0, totalAlready = 0, totalToClassify = 0, totalErrors = 0;

for (const client of targets) {
  const cid = client.id;
  const postsPath = join(DATA_DIR, cid, 'posts-latest.json');
  if (!existsSync(postsPath)) { console.log(`✗ ${cid}: no posts-latest.json — skipped`); continue; }

  const posts = readJsonSafe(postsPath);
  const allPosts = [];
  for (const [pf, arr] of Object.entries(posts?.platforms || {})) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (!p.url) continue;
      allPosts.push({ ...p, platform: pf });
    }
  }
  if (allPosts.length === 0) { console.log(`⊘ ${cid}: no posts — skipped`); continue; }

  const existing = loadClassifications(cid) || [];
  const classifiedUrls = new Set(existing.map(c => c.post_id || c.url).filter(Boolean));
  let toClassify = allPosts.filter(p => !classifiedUrls.has(p.url));
  totalToClassify += toClassify.length;

  if (toClassify.length === 0) {
    console.log(`✓ ${cid}: ${allPosts.length} posts already fully classified`);
    totalAlready += existing.length;
    continue;
  }

  if (maxPer && toClassify.length > maxPer) {
    // Prioritise highest-engagement posts when capping
    toClassify.sort((a, b) => ((b.likes||0) + (b.comments||0) + (b.shares||0)) - ((a.likes||0) + (a.comments||0) + (a.shares||0)));
    toClassify = toClassify.slice(0, maxPer);
  }

  if (dryRun) {
    console.log(`◇ ${cid}: would classify ${toClassify.length} new (existing ${existing.length}, total ${allPosts.length})`);
    continue;
  }

  console.log(`→ ${cid}: classifying ${toClassify.length} new (existing ${existing.length}, total ${allPosts.length})...`);
  const start = Date.now();
  let newClassifications = [];
  try {
    newClassifications = await classifyPosts(callLLM, toClassify);
  } catch (err) {
    console.log(`✗ ${cid}: classifier error — ${err.message?.slice(0, 100)}`);
    totalErrors++;
    continue;
  }

  const now = new Date().toISOString();
  for (const c of newClassifications) {
    c.created_at = now;
    c.client_id = cid;
  }

  const merged = [...existing, ...newClassifications];
  saveClassifications(cid, merged);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✓ ${cid}: +${newClassifications.length} classifications (${elapsed}s)`);
  totalAdded += newClassifications.length;
  totalAlready += existing.length;
}

console.log('');
console.log('━━━ SUMMARY ━━━');
console.log(`  clients processed:        ${targets.length}`);
console.log(`  classifications added:    ${totalAdded}`);
console.log(`  classifications existing: ${totalAlready}`);
console.log(`  unclassified found:       ${totalToClassify}`);
console.log(`  errors:                   ${totalErrors}`);
if (!dryRun) {
  // DeepSeek V3 pricing: $0.27/M input, $1.10/M output. Per classification ~600 in / 250 out tokens.
  const estCost = (totalAdded * 600 / 1_000_000 * 0.27) + (totalAdded * 250 / 1_000_000 * 1.10);
  console.log(`  est. cost (DeepSeek V3):  $${estCost.toFixed(4)}`);
}
