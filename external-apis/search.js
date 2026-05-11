/**
 * Unified search with automatic fallback.
 *
 * Tries providers in order based on configuration:
 *   Exa (rich content) → Tavily (cheap clone) → Brave (independent index) → NewsAPI (news only)
 *
 * Returns normalised: { provider, results: [{title, url, text, publishedDate, score?}] }
 *
 * Usage:
 *   import { search, newsSearch } from './external-apis/search.js';
 *   const r = await search('best fitness influencers Singapore 2026', { numResults: 10 });
 */

import * as tavily from './tavily.js';
import * as brave from './brave-search.js';
import * as newsapi from './newsapi.js';

// Exa is in scraper/platforms/exa.js — re-import here for parity
async function exaCall(query, opts) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set');
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      type: opts.type || 'auto',
      numResults: opts.numResults || 10,
      contents: { text: { maxCharacters: opts.maxChars || 4000 } },
      category: opts.category,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Exa ${res.status}: ${err.slice(0, 160)}`);
  }
  const j = await res.json();
  return (j.results || []).map(r => ({
    title: r.title, url: r.url, text: r.text || '', publishedDate: r.publishedDate, score: r.score,
  }));
}

const PROVIDER_FNS = {
  exa: { available: () => !!process.env.EXA_API_KEY, call: (q, o) => exaCall(q, o) },
  tavily: { available: () => !!process.env.TAVILY_API_KEY, call: async (q, o) => (await tavily.search(q, o)).results },
  brave: { available: () => !!process.env.BRAVE_SEARCH_API_KEY, call: async (q, o) => (await brave.search(q, o)).results },
};

const DEFAULT_ORDER = ['exa', 'tavily', 'brave'];

/**
 * Try providers in order until one works. Returns { provider, results }.
 * Override order via opts.order (e.g. ['tavily', 'exa']).
 */
export async function search(query, opts = {}) {
  const order = opts.order || DEFAULT_ORDER;
  const errors = [];
  for (const name of order) {
    const p = PROVIDER_FNS[name];
    if (!p?.available()) {
      errors.push(`${name}: not configured`);
      continue;
    }
    try {
      const results = await p.call(query, opts);
      if (results?.length) return { provider: name, results };
      errors.push(`${name}: empty results`);
    } catch (err) {
      // Common credit-exhaustion strings — automatically skip to next
      const msg = err.message || '';
      const isCredit = /402|credits|quota|exceeded|insufficient/i.test(msg);
      console.log(`  [search/${name}] ${isCredit ? 'CREDIT' : 'fail'}: ${msg.slice(0, 100)}`);
      errors.push(`${name}: ${msg.slice(0, 80)}`);
    }
  }
  throw new Error(`All search providers failed: ${errors.join(' | ')}`);
}

/**
 * News-specific search — prefers Brave news + NewsAPI events; Exa as fallback.
 */
export async function newsSearch(query, opts = {}) {
  const order = opts.order || ['brave-news', 'newsapi-events', 'tavily-news', 'exa'];
  const errors = [];
  for (const name of order) {
    try {
      let results = null;
      if (name === 'brave-news' && process.env.BRAVE_SEARCH_API_KEY) {
        results = await brave.newsSearch(query, opts);
      } else if (name === 'newsapi-events' && process.env.NEWSAPI_AI_KEY) {
        const events = await newsapi.searchEvents(query, opts);
        results = events.map(e => ({
          title: e.title, url: e.eventUri, text: e.summary,
          publishedDate: e.eventDate, source: e.location?.label?.eng,
        }));
      } else if (name === 'tavily-news' && process.env.TAVILY_API_KEY) {
        const r = await tavily.search(query, { ...opts, topic: 'news' });
        results = r.results;
      } else if (name === 'exa' && process.env.EXA_API_KEY) {
        results = await exaCall(query, { ...opts, category: 'news' });
      } else {
        errors.push(`${name}: not configured`);
        continue;
      }
      if (results?.length) return { provider: name, results };
      errors.push(`${name}: empty`);
    } catch (err) {
      console.log(`  [news/${name}] fail: ${err.message?.slice(0,100)}`);
      errors.push(`${name}: ${err.message?.slice(0,80)}`);
    }
  }
  throw new Error(`All news providers failed: ${errors.join(' | ')}`);
}
