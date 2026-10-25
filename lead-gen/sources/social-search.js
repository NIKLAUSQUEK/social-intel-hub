/**
 * Social profile discovery via search engines.
 *
 * This is the SocLeads technique: instead of crawling the platforms (logins,
 * anti-bot, ToS), ask a search API for public profiles whose indexed bio
 * matches the niche + location and mentions contact details. We only read
 * what the search engine already shows publicly.
 */

import { search } from '../../external-apis/search.js';
import { extractContacts, hasBuyingIntent } from '../extract.js';
import { makeLead } from '../lead.js';

const CONTACT_HINT = '("@gmail.com" OR "@yahoo.com" OR "@hotmail.com" OR "email" OR "contact" OR "whatsapp")';

// profile: regex over the URL path whose match is the canonical profile path —
// posts, videos and tweets collapse to the account that published them.
export const PLATFORMS = {
  instagram: { site: 'instagram.com', host: /(^|\.)instagram\.com$/,
    profile: /^\/(?!(?:p|reel|reels|explore|stories|tv|accounts)\/)[a-z0-9._]{2,30}/i },
  facebook: { site: 'facebook.com', host: /(^|\.)facebook\.com$/,
    profile: /^\/(?!(?:groups|events|watch|share|sharer|photo|hashtag|marketplace|login)[/.])[a-z0-9.\-]{3,80}/i },
  'facebook-groups': { site: 'facebook.com/groups', host: /(^|\.)facebook\.com$/, profile: /^\/groups\/[^/]+/i },
  linkedin: { site: 'linkedin.com', host: /(^|\.)linkedin\.com$/, profile: /^\/(in|company)\/[^/]+/i },
  tiktok: { site: 'tiktok.com', host: /(^|\.)tiktok\.com$/, profile: /^\/@[a-z0-9._]{2,30}/i },
  x: { site: 'x.com', host: /(^|\.)(x|twitter)\.com$/,
    profile: /^\/(?!(?:i|search|hashtag|intent|home|explore)\/?)[a-z0-9_]{2,15}/i },
  youtube: { site: 'youtube.com', host: /(^|\.)youtube\.com$/, profile: /^\/(@[^/]+|channel\/[^/]+|c\/[^/]+)/i },
};

// "Jane Doe (@janedoe) • Instagram photos and videos" → "Jane Doe"
export function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*[|•·\-–—]\s*(Instagram|Facebook|LinkedIn|TikTok|X|Twitter|YouTube).*$/i, '')
    .replace(/\s*\(@[^)]+\)\s*/g, ' ')
    .replace(/\s+on (Instagram|TikTok|X|Twitter).*$/i, '')
    .trim();
}

export function buildQuery(platform, keyword, location) {
  const p = PLATFORMS[platform];
  const loc = location ? ` "${location}"` : '';
  if (platform === 'facebook-groups') return `site:${p.site} "${keyword}"${loc}`;
  return `site:${p.site} "${keyword}"${loc} ${CONTACT_HINT}`;
}

/** Turn one search hit into a lead (or a group record). */
export function resultToLead(platform, r, { keyword, location, provider }) {
  let url;
  try { url = new URL(r.url); } catch { return null; }
  const p = PLATFORMS[platform];
  if (!p.host.test(url.hostname)) return null;
  const path = url.pathname.match(p.profile)?.[0];
  if (!path) return null;

  const text = `${r.title || ''}\n${r.text || ''}`;
  const c = extractContacts(text);
  const lead = makeLead({
    name: cleanTitle(r.title),
    platform,
    profileUrl: `${url.origin}${path}`,
    website: c.websites[0] || '',
    bio: r.text,
    emails: c.emails,
    phones: c.phones,
    socials: c.socials,
    location,
    keyword,
    intent: hasBuyingIntent(r.text),
    evidence: [{ source: `search:${provider}`, url: r.url, at: new Date().toISOString() }],
  });
  return lead;
}

/**
 * @returns {{ leads: object[], groups: object[], errors: string[] }}
 */
export async function findOnPlatform(platform, { keyword, location, numResults = 20 }) {
  if (!PLATFORMS[platform]) throw new Error(`Unknown platform: ${platform}`);
  const query = buildQuery(platform, keyword, location);
  const { provider, results } = await search(query, { numResults, order: ['brave', 'tavily', 'exa'] });

  const leads = [];
  const groups = [];
  for (const r of results) {
    const lead = resultToLead(platform, r, { keyword, location, provider });
    if (!lead) continue;
    if (platform === 'facebook-groups') {
      // A group isn't a lead by itself — keep it as a community to work manually,
      // and only promote it to a lead if the snippet carries contact details.
      groups.push({ name: lead.name, url: lead.profileUrl, snippet: lead.bio, keyword, location });
      if (!lead.emails.length && !lead.phones.length) continue;
    }
    leads.push(lead);
  }
  return { leads, groups, query };
}
