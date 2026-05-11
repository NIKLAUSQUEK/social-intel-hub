/**
 * Tavily Search — drop-in Exa fallback.
 *
 * Pricing (April 2026): ~$0.005 per search, 1000 free/month.
 * Setup: https://tavily.com → API keys → set TAVILY_API_KEY
 *
 * Returns shape compatible with our exa-style consumers (results: [{title, url, text, score}]).
 */

export async function search(query, opts = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY not set');

  const body = {
    api_key: key,
    query,
    search_depth: opts.depth || 'basic', // 'basic' or 'advanced'
    topic: opts.topic || 'general',      // 'general' | 'news'
    max_results: opts.numResults || 10,
    include_answer: opts.includeAnswer || false,
    include_raw_content: opts.includeContent ?? true,
    days: opts.days, // for news topic — recency window
  };

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Tavily ${res.status}: ${err.slice(0, 160)}`);
  }
  const j = await res.json();

  return {
    answer: j.answer,
    results: (j.results || []).map(r => ({
      title: r.title,
      url: r.url,
      text: r.raw_content || r.content || '',
      score: r.score,
      publishedDate: r.published_date,
    })),
  };
}
