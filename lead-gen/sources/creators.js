/**
 * Creator discovery — local creators whose audience matches your buyer.
 *
 * Reach their followers through the creator (paid post, collab, giveaway
 * with comment-to-DM) instead of contacting followers one by one.
 *
 * Same search-API approach as social-search.js, with creator-flavoured
 * queries and follower counts parsed from the indexed snippet.
 */

import { search } from '../../external-apis/search.js';
import { resultToLead } from './social-search.js';

const CREATOR_HINT = '(creator OR influencer OR blogger OR "content creator" OR collab OR "for collabs")';
export const CREATOR_PLATFORMS = ['instagram', 'tiktok', 'youtube'];

// Follower tiers — micro creators usually give the best cost per engaged follower
export const TIERS = [
  { name: 'nano', min: 1_000, max: 10_000 },
  { name: 'micro', min: 10_000, max: 100_000 },
  { name: 'mid', min: 100_000, max: 500_000 },
  { name: 'macro', min: 500_000, max: Infinity },
];

/** "12.3K Followers" / "1,204 followers" / "1.2M subscribers" → number */
export function parseFollowers(text) {
  const m = String(text || '').match(/([\d.,]+)\s*([KMB])?\s*(followers|subscribers|fans)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

export function tierFor(followers) {
  if (followers == null) return 'unknown';
  return TIERS.find(t => followers >= t.min && followers < t.max)?.name || 'below-nano';
}

export function buildCreatorQuery(platform, keyword, location) {
  const site = { instagram: 'instagram.com', tiktok: 'tiktok.com', youtube: 'youtube.com' }[platform];
  return `site:${site} "${keyword}"${location ? ` "${location}"` : ''} ${CREATOR_HINT}`;
}

/** Creator source — returns leads with kind:'creator', followers and tier. */
export async function findCreators(platform, { keyword, location, numResults = 20 }) {
  const query = buildCreatorQuery(platform, keyword, location);
  const { provider, results } = await search(query, { numResults, order: ['brave', 'tavily', 'exa'] });
  const leads = [];
  for (const r of results) {
    const lead = resultToLead(platform, r, { keyword, location, provider });
    if (!lead) continue;
    lead.kind = 'creator';
    lead.followers = parseFollowers(`${r.title} ${r.text}`);
    lead.tier = tierFor(lead.followers);
    leads.push(lead);
  }
  return { leads, groups: [], query };
}
