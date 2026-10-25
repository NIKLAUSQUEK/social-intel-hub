/**
 * YouTube channels via the official YouTube Data API v3.
 * Channel "About" descriptions often carry a business email.
 *
 * Setup: Google Cloud → enable "YouTube Data API v3" → API key → YOUTUBE_API_KEY
 * Quota: search = 100 units, channels.list = 1 unit; default 10,000 units/day.
 */

import { extractContacts } from '../extract.js';
import { makeLead } from '../lead.js';

async function yt(path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: process.env.YOUTUBE_API_KEY })) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`YouTube ${path} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

export async function findChannels({ keyword, location, numResults = 20 }) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY not set');
  const q = [keyword, location].filter(Boolean).join(' ');
  const s = await yt('search', { part: 'snippet', type: 'channel', q, maxResults: Math.min(50, numResults) });
  const ids = (s.items || []).map(i => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
  if (!ids.length) return { leads: [], groups: [], query: q };

  const c = await yt('channels', { part: 'snippet,statistics', id: ids.join(',') });
  const leads = (c.items || []).map(ch => {
    const desc = ch.snippet?.description || '';
    const x = extractContacts(desc);
    const url = ch.snippet?.customUrl
      ? `https://www.youtube.com/${ch.snippet.customUrl}`
      : `https://www.youtube.com/channel/${ch.id}`;
    return makeLead({
      name: ch.snippet?.title,
      platform: 'youtube',
      profileUrl: url,
      bio: `${desc} (${ch.statistics?.subscriberCount || '?'} subscribers)`,
      emails: x.emails,
      phones: x.phones,
      socials: x.socials,
      website: x.websites[0] || '',
      location: ch.snippet?.country || location,
      keyword,
      evidence: [{ source: 'youtube-data-api', url, at: new Date().toISOString() }],
    });
  });
  return { leads, groups: [], query: q };
}
