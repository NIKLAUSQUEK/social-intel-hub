/**
 * NewsAPI.ai (formerly Event Registry) — global news aggregation.
 *
 * Setup: https://newsapi.ai → set NEWSAPI_AI_KEY
 * Free tier: 500 requests/day with full content.
 *
 * Two endpoints used:
 *   /article/getArticles — keyword news search
 *   /event/getEvents — clustered news events (great for trend-jacking)
 */

const BASE = 'https://eventregistry.org/api/v1';

function getKey() {
  const k = process.env.NEWSAPI_AI_KEY;
  if (!k) throw new Error('NEWSAPI_AI_KEY not set');
  return k;
}

export async function searchArticles(query, opts = {}) {
  const body = {
    apiKey: getKey(),
    keyword: query,
    keywordOper: 'and',
    lang: opts.lang || 'eng',
    articlesSortBy: opts.sortBy || 'rel', // 'rel' | 'date' | 'sourceImportance' | 'socialScore'
    articlesCount: opts.numResults || 20,
    articlesPage: 1,
    dateStart: opts.dateStart,        // 'YYYY-MM-DD'
    dateEnd: opts.dateEnd,
    resultType: 'articles',
    includeArticleConcepts: true,
    includeArticleSocialScore: true,
    sourceLocationUri: opts.country,    // optional country filter
  };
  const res = await fetch(`${BASE}/article/getArticles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`NewsAPI articles ${res.status}`);
  const j = await res.json();
  return (j.articles?.results || []).map(a => ({
    title: a.title,
    url: a.url,
    text: a.body || '',
    source: a.source?.title,
    publishedDate: a.dateTime,
    sentiment: a.sentiment,
    socialScore: a.socialScore,
    image: a.image,
  }));
}

/**
 * Get clustered "events" (multiple articles about same story).
 * Perfect for trend-jacking: one event = one trending moment.
 */
export async function searchEvents(query, opts = {}) {
  const body = {
    apiKey: getKey(),
    keyword: query,
    eventsSortBy: opts.sortBy || 'rel',
    eventsCount: opts.numResults || 20,
    resultType: 'events',
    includeEventLocation: true,
    includeEventConcepts: true,
    includeEventCategories: true,
    dateStart: opts.dateStart,
    dateEnd: opts.dateEnd,
  };
  const res = await fetch(`${BASE}/event/getEvents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`NewsAPI events ${res.status}`);
  const j = await res.json();
  return (j.events?.results || []).map(e => ({
    eventUri: e.uri,
    title: e.title?.eng || Object.values(e.title || {})[0],
    summary: e.summary?.eng || Object.values(e.summary || {})[0],
    eventDate: e.eventDate,
    articleCount: e.totalArticleCount,
    socialScore: e.socialScore,
    location: e.location,
    categories: (e.categories || []).map(c => c.label?.eng).filter(Boolean),
    concepts: (e.concepts || []).slice(0, 5).map(c => c.label?.eng).filter(Boolean),
  }));
}
