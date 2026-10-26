/**
 * Lead record — shape, scoring and de-duplication.
 */

import { createHash } from 'crypto';
import { isFreemail } from './extract.js';

/**
 * Build a normalised lead. Every source returns these.
 *
 * evidence[] records where each detail came from so a human can verify
 * before outreach (and so we can answer "where did you get my data?").
 */
export function makeLead({
  name = '', platform, profileUrl = '', bio = '', emails = [], phones = [], website = '',
  socials = {}, location = '', keyword = '', intent = false, evidence = [],
}) {
  return {
    id: '',
    name: String(name).trim().slice(0, 200),
    platform,
    profileUrl,
    bio: String(bio).replace(/\s+/g, ' ').trim().slice(0, 600),
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
    website,
    socials,
    location,
    keyword,
    intent: !!intent,
    evidence,
    score: 0,
    foundAt: new Date().toISOString(),
  };
}

/** Stable identity: first email, else profile URL, else website. */
export function leadKey(lead) {
  const basis = lead.emails[0] || lead.profileUrl || lead.website || `${lead.platform}:${lead.name}`;
  return createHash('sha1').update(basis.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * 0–100. Contactability first, then fit.
 *   business email 35 · freemail 25 · phone 20 · website 10 · extra socials 5 each (max 10)
 *   keyword in name/bio 15 · buying intent 10
 */
export function scoreLead(lead) {
  let s = 0;
  if (lead.emails.some(e => !isFreemail(e))) s += 35;
  else if (lead.emails.length) s += 25;
  if (lead.phones.length) s += 20;
  if (lead.website) s += 10;
  const socialCount = Object.values(lead.socials || {}).flat().length;
  s += Math.min(10, socialCount * 5);
  const kw = String(lead.keyword || '').toLowerCase();
  if (kw && `${lead.name} ${lead.bio}`.toLowerCase().includes(kw)) s += 15;
  if (lead.intent) s += 10;
  // Creators: micro and mid tiers are the sweet spot for local B2C reach
  if (lead.kind === 'creator') s += { micro: 25, mid: 20, nano: 15, macro: 10 }[lead.tier] || 0;
  return Math.min(100, s);
}

function mergeSocials(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = [...new Set([...(out[k] || []), ...v])];
  return out;
}

/**
 * Merge leads that share an email, profile URL or website.
 * Returns scored leads, best first.
 */
export function dedupeLeads(leads) {
  const byKey = new Map();
  const alias = new Map(); // any email/url → canonical key

  for (const lead of leads) {
    const ids = [...lead.emails, lead.profileUrl, lead.website].filter(Boolean).map(s => s.toLowerCase());
    const existingKey = ids.map(i => alias.get(i)).find(Boolean);

    if (existingKey) {
      const cur = byKey.get(existingKey);
      cur.emails = [...new Set([...cur.emails, ...lead.emails])];
      cur.phones = [...new Set([...cur.phones, ...lead.phones])];
      cur.website ||= lead.website;
      cur.bio ||= lead.bio;
      cur.name ||= lead.name;
      cur.intent ||= lead.intent;
      cur.kind ||= lead.kind;
      cur.followers ??= lead.followers;
      cur.tier ||= lead.tier;
      cur.socials = mergeSocials(cur.socials, lead.socials);
      cur.evidence = [...cur.evidence, ...lead.evidence];
      ids.forEach(i => alias.set(i, existingKey));
    } else {
      const key = leadKey(lead);
      byKey.set(key, { ...lead, id: key });
      ids.forEach(i => alias.set(i, key));
    }
  }

  return [...byKey.values()]
    .map(l => ({ ...l, score: scoreLead(l) }))
    .sort((a, b) => b.score - a.score);
}

const CSV_COLS = ['score', 'kind', 'followers', 'tier', 'name', 'platform', 'profileUrl', 'emails', 'phones', 'website',
  'socials', 'location', 'keyword', 'intent', 'bio', 'sources', 'foundAt'];

function csvCell(v) {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection, then quote
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function leadsToCsv(leads) {
  const rows = leads.map(l => [
    l.score, l.kind || 'lead', l.followers ?? '', l.tier || '', l.name, l.platform, l.profileUrl, l.emails.join('; '), l.phones.join('; '), l.website,
    Object.values(l.socials || {}).flat().join('; '), l.location, l.keyword, l.intent ? 'yes' : '',
    l.bio, [...new Set(l.evidence.map(e => e.url))].join('; '), l.foundAt,
  ].map(csvCell).join(','));
  return [CSV_COLS.join(','), ...rows].join('\n');
}
