#!/usr/bin/env node
/**
 * Lead-gen CLI
 *
 *   npm run leads -- --keywords "dentist,orthodontist" --location "Singapore" \
 *                    --sources instagram,facebook,google-maps --limit 200 --out leads.csv
 *   npm run leads -- --list-sources
 *   npm run leads -- --suppress someone@example.com
 */

import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Same .env.local locations as scraper/ — repo root first, then its parent
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env.local') });
dotenv.config({ path: join(ROOT, '..', '.env.local') });

// Imported after env is loaded (index.js reads LEADGEN_DATA_DIR at import)
const { runCampaign, SOURCES, DEFAULT_SOURCES, addSuppression } = await import('./index.js');
const { leadsToCsv } = await import('./lead.js');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const flag = name => process.argv.includes(`--${name}`);

if (flag('list-sources')) {
  console.log(Object.keys(SOURCES).join('\n'));
  process.exit(0);
}

if (arg('suppress')) {
  addSuppression(arg('suppress'), arg('reason', 'opt-out'));
  console.log(`Suppressed ${arg('suppress')}`);
  process.exit(0);
}

const keywords = arg('keywords');
if (!keywords) {
  console.error('Usage: npm run leads -- --keywords "dentist" [--location "Singapore"] [--sources a,b] [--limit 100] [--out file.csv] [--no-enrich] [--all]');
  process.exit(1);
}

const c = await runCampaign({
  keywords,
  location: arg('location', ''),
  sources: (arg('sources') || DEFAULT_SOURCES.join(',')).split(',').map(s => s.trim()),
  limit: Number(arg('limit', 100)),
  perQuery: Number(arg('per-query', 20)),
  enrich: !flag('no-enrich'),
  requireContact: !flag('all'),
}, {
  onProgress: x => process.stdout.write(`\r  ${x.progress.done}/${x.progress.total} searches`),
});

console.log('\n');
for (const l of c.log) console.log(`  ${l.error ? '✗' : '✓'} ${l.source.padEnd(16)} ${l.keyword.padEnd(20)} ${l.error || `${l.found} hits`}`);
console.log(`\n  ${c.stats.kept} leads kept (${c.stats.withEmail} with email, ${c.stats.withPhone} with phone), ${c.groups.length} groups found`);
console.log(`  Campaign ${c.id}`);

const out = arg('out');
if (out) {
  writeFileSync(out, leadsToCsv(c.leads));
  console.log(`  Wrote ${out}`);
}
