/**
 * Lead-gen campaigns — run sources, enrich, de-dupe, score, store.
 *
 *   import { runCampaign } from './lead-gen/index.js';
 *   const c = await runCampaign({ keywords: ['dentist'], location: 'Singapore',
 *                                 sources: ['instagram', 'google-maps'], limit: 100 });
 *
 * Campaigns are stored as JSON in data/leads/campaigns/ (gitignored).
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { findOnPlatform, PLATFORMS } from './sources/social-search.js';
import { findPlaces } from './sources/google-maps.js';
import { findChannels } from './sources/youtube.js';
import { findIntentPosts } from './sources/reddit.js';
import { enrichFromWebsite } from './enrich.js';
import { dedupeLeads } from './lead.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LEADGEN_DATA_DIR
  || (process.env.VERCEL ? '/tmp/leads' : join(__dirname, '..', 'data', 'leads'));
const CAMPAIGN_DIR = join(DATA_DIR, 'campaigns');
const SUPPRESSION_FILE = join(DATA_DIR, 'suppression.json');

/** source id → (opts) => { leads, groups, query } */
export const SOURCES = {
  ...Object.fromEntries(Object.keys(PLATFORMS).map(p => [p, o => findOnPlatform(p, o)])),
  'youtube-api': findChannels,
  'google-maps': findPlaces,
  reddit: findIntentPosts,
};

export const DEFAULT_SOURCES = ['instagram', 'facebook', 'linkedin', 'tiktok', 'google-maps'];

// ── Suppression (opt-outs) ─────────────────────────

export function loadSuppression() {
  try { return JSON.parse(readFileSync(SUPPRESSION_FILE, 'utf-8')); } catch { return { entries: [] }; }
}

export function addSuppression(value, reason = 'opt-out') {
  const s = loadSuppression();
  const v = String(value).trim().toLowerCase();
  if (!v || s.entries.some(e => e.value === v)) return s;
  s.entries.push({ value: v, reason, at: new Date().toISOString() });
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUPPRESSION_FILE, JSON.stringify(s, null, 2));
  return s;
}

/** Suppress by exact email, @domain, or profile/website URL. */
export function isSuppressed(lead, suppression = loadSuppression()) {
  const vals = new Set(suppression.entries.map(e => e.value));
  if (!vals.size) return false;
  const ids = [...lead.emails, lead.profileUrl, lead.website].filter(Boolean).map(s => s.toLowerCase());
  return ids.some(i => vals.has(i))
    || lead.emails.some(e => vals.has(`@${e.split('@')[1]}`));
}

// ── Storage ────────────────────────────────────────

function save(c) {
  mkdirSync(CAMPAIGN_DIR, { recursive: true });
  writeFileSync(join(CAMPAIGN_DIR, `${c.id}.json`), JSON.stringify(c, null, 2));
  return c;
}

export function getCampaign(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const f = join(CAMPAIGN_DIR, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : null;
}

export function listCampaigns() {
  if (!existsSync(CAMPAIGN_DIR)) return [];
  return readdirSync(CAMPAIGN_DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(CAMPAIGN_DIR, f), 'utf-8')))
    .map(({ leads, groups, ...meta }) => ({ ...meta, leadCount: leads.length, groupCount: groups.length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Run ────────────────────────────────────────────

export function createCampaign({ keywords, location = '', sources = DEFAULT_SOURCES, limit = 100,
  perQuery = 20, enrich = true, requireContact = true, name }) {
  const kws = (Array.isArray(keywords) ? keywords : String(keywords || '').split(','))
    .map(k => k.trim()).filter(Boolean).slice(0, 10);
  if (!kws.length) throw new Error('At least one keyword is required');
  const unknown = sources.filter(s => !SOURCES[s]);
  if (unknown.length) throw new Error(`Unknown sources: ${unknown.join(', ')}`);

  return save({
    id: randomUUID(),
    name: name || `${kws.join(', ')}${location ? ` — ${location}` : ''}`,
    params: { keywords: kws, location, sources, limit: Math.min(1000, limit),
      perQuery: Math.min(50, perQuery), enrich, requireContact },
    status: 'queued',
    progress: { done: 0, total: kws.length * sources.length },
    log: [],
    leads: [],
    groups: [],
    createdAt: new Date().toISOString(),
  });
}

export async function executeCampaign(campaign, { onProgress } = {}) {
  const c = campaign;
  const { keywords, location, sources, limit, perQuery, enrich, requireContact } = c.params;
  c.status = 'running';
  save(c);

  let raw = [];
  for (const keyword of keywords) {
    for (const source of sources) {
      try {
        const r = await SOURCES[source]({ keyword, location, numResults: perQuery });
        raw.push(...r.leads);
        c.groups.push(...r.groups);
        c.log.push({ source, keyword, query: r.query, found: r.leads.length, at: new Date().toISOString() });
      } catch (err) {
        c.log.push({ source, keyword, error: err.message?.slice(0, 200), at: new Date().toISOString() });
      }
      c.progress.done++;
      onProgress?.(c);
      save(c);
    }
  }

  let leads = dedupeLeads(raw);

  if (enrich) {
    const toEnrich = leads.filter(l => l.website && !l.emails.length).slice(0, limit);
    for (const l of toEnrich) {
      try { Object.assign(l, await enrichFromWebsite(l)); } catch { /* keep un-enriched */ }
    }
    leads = dedupeLeads(leads);
  }

  const suppression = loadSuppression();
  const unique = leads.length;
  leads = leads.filter(l => !isSuppressed(l, suppression));
  const suppressed = unique - leads.length;
  if (requireContact) leads = leads.filter(l => l.emails.length || l.phones.length || l.intent);

  c.leads = leads.slice(0, limit);
  c.groups = [...new Map(c.groups.map(g => [g.url, g])).values()];
  c.stats = {
    raw: raw.length,
    unique,
    suppressed,
    kept: c.leads.length,
    withEmail: c.leads.filter(l => l.emails.length).length,
    withPhone: c.leads.filter(l => l.phones.length).length,
  };
  c.status = 'done';
  c.finishedAt = new Date().toISOString();
  return save(c);
}

export async function runCampaign(params, opts) {
  return executeCampaign(createCampaign(params), opts);
}
