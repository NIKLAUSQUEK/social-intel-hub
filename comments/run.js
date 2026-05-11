/**
 * Comment intel runner — CLI entry point
 *
 * Usage:
 *   node comments/run.js                 — all active clients
 *   node comments/run.js --client daniel-sim
 *   node comments/run.js --limit 20      — cap posts per platform
 *   node comments/run.js --dry-run       — estimate cost without running
 *
 * Budget guard:
 *   Reads COMMENTS_MONTHLY_USD_CAP from .env.local (default 10)
 *   Aborts run if this month's spend would exceed cap
 *   Logs every run to logs/comments/YYYY-MM.jsonl
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { analyseClient } from './analyse.js';
import { getSocialKitUsage } from './socialkit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '..', '.env.local') });

const LOG_DIR = join(ROOT, 'logs', 'comments');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ── Args ───────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] || true;
};

const targetClient = flag('client');
const limit = parseInt(flag('limit') || '50', 10);
const dryRun = Boolean(flag('dry-run'));

// ── Budget tracking ────────────────────────────────

function logRun(record) {
  const file = join(LOG_DIR, `${new Date().toISOString().slice(0, 7)}.jsonl`);
  const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  writeFileSync(file, existing + JSON.stringify(record) + '\n');
}

function getMonthSpend() {
  const file = join(LOG_DIR, `${new Date().toISOString().slice(0, 7)}.jsonl`);
  if (!existsSync(file)) return 0;
  let total = 0;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line) continue;
    try {
      total += JSON.parse(line).cost || 0;
    } catch { /* skip */ }
  }
  return total;
}

// ── Estimate per client (for dry-run) ──────────────

function estimatePerClient() {
  // Assumes: 50 posts × 30 comments avg × 0.5 after dedupe = ~750 classified
  // LLM: ~100 input + 50 output tokens per comment = 150 tokens
  // Cluster summary: ~8 clusters × 300 tokens
  const commentsPerClient = 50 * 30 * 0.5;
  const apifyIG = (commentsPerClient * 0.5 / 100) * 0.002;
  const apifyTT = (commentsPerClient * 0.5 / 100) * 0.003;
  const llmCost = commentsPerClient * ((100 * 0.075 + 50 * 0.30) / 1_000_000);
  const summaryCost = 8 * ((200 * 0.075 + 300 * 0.30) / 1_000_000);
  return apifyIG + apifyTT + llmCost + summaryCost;
}

// ── Main ───────────────────────────────────────────

async function main() {
  const configPath = join(ROOT, 'clients.json');
  const { clients } = JSON.parse(readFileSync(configPath, 'utf-8'));

  let targets = clients.filter(c => c.active);
  if (targetClient) {
    targets = targets.filter(c => c.id === targetClient);
    if (!targets.length) {
      console.error(`Client not found: ${targetClient}`);
      process.exit(1);
    }
  }

  const cap = parseFloat(process.env.COMMENTS_MONTHLY_USD_CAP || '10');
  const spent = getMonthSpend();
  const perClient = estimatePerClient();
  const estimated = targets.length * perClient;

  const sk = getSocialKitUsage();
  console.log('═══════════════════════════════════════════');
  console.log('  Comment Intel Runner');
  console.log('═══════════════════════════════════════════');
  console.log(`  Clients:       ${targets.length}`);
  console.log(`  Posts cap:     ${limit}/platform`);
  console.log(`  Monthly cap:   $${cap.toFixed(2)}`);
  console.log(`  Spent MTD:     $${spent.toFixed(4)}`);
  console.log(`  Est. this run: $${estimated.toFixed(4)}`);
  console.log(`  Projected MTD: $${(spent + estimated).toFixed(4)}`);
  console.log(`  SocialKit:     ${sk.creditsUsed}/${sk.cap} credits used (${sk.remaining} remaining)`);
  console.log('═══════════════════════════════════════════');

  if (dryRun) {
    console.log('\nDry run — exiting before any calls.');
    return;
  }

  if (spent + estimated > cap) {
    console.error(`\n✗ Budget guard: would exceed monthly cap ($${cap}).`);
    console.error('  Raise COMMENTS_MONTHLY_USD_CAP or wait for next month.');
    process.exit(2);
  }

  if (!process.env.APIFY_TOKEN && !process.env.APIFY_API_TOKEN) {
    console.error('\n✗ APIFY_TOKEN missing in .env.local');
    process.exit(3);
  }
  if (!process.env.GEMINI_API_KEY && !process.env.DEEPSEEK_API_KEY && !process.env.KIMI_API_KEY) {
    console.error('\n✗ No LLM API keys set — need GEMINI_API_KEY, DEEPSEEK_API_KEY, or KIMI_API_KEY');
    process.exit(3);
  }

  const results = [];
  for (const c of targets) {
    try {
      const result = await analyseClient(c, { limitPerPlatform: limit });
      if (result) {
        results.push({ clientId: c.id, ...result.costs });
        logRun({
          t: new Date().toISOString(),
          clientId: c.id,
          cost: result.costs.total,
          commentCount: result.commentCount,
          contentIdeas: result.contentIdeas.length,
        });
      }
    } catch (err) {
      console.error(`  ✗ ${c.name}: ${err.message}`);
      logRun({ t: new Date().toISOString(), clientId: c.id, error: err.message, cost: 0 });
    }
  }

  const totalCost = results.reduce((s, r) => s + (r.total || 0), 0);
  const sk2 = getSocialKitUsage();
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Done: ${results.length}/${targets.length} clients`);
  console.log(`  Run cost: $${totalCost.toFixed(4)}`);
  console.log(`  MTD spent: $${(spent + totalCost).toFixed(4)} / $${cap.toFixed(2)}`);
  console.log(`  SocialKit: ${sk2.creditsUsed}/${sk2.cap} credits used (${sk2.remaining} remaining)`);
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
