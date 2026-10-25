/**
 * Reddit buying-intent posts via the official Reddit API.
 * Leads here are people asking for a service ("looking for a photographer in…"),
 * not contact records — reply in-thread or by Reddit DM, by hand.
 *
 * Setup: see external-apis/reddit.js (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET).
 */

import { searchPosts } from '../../external-apis/reddit.js';
import { hasBuyingIntent } from '../extract.js';
import { makeLead } from '../lead.js';

export async function findIntentPosts({ keyword, location, numResults = 25 }) {
  const q = [keyword, location].filter(Boolean).join(' ');
  const posts = await searchPosts(q, { sort: 'new', timeframe: 'month', limit: Math.min(100, numResults * 2) });
  const leads = posts
    .filter(p => p.author && p.author !== '[deleted]' && hasBuyingIntent(`${p.title} ${p.text}`))
    .slice(0, numResults)
    .map(p => makeLead({
      name: `u/${p.author}`,
      platform: 'reddit',
      profileUrl: `https://www.reddit.com/user/${p.author}`,
      bio: `r/${p.subreddit}: ${p.title} — ${p.text}`,
      location,
      keyword,
      intent: true,
      evidence: [{ source: 'reddit-api', url: p.url, at: new Date().toISOString() }],
    }));
  return { leads, groups: [], query: q };
}
