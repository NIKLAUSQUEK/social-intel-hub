/**
 * Brave Search API — independent index, different results vs Google/Exa.
 *
 * Pricing: 2,000 free queries/month on the Free tier.
 * Setup: https://brave.com/search/api/ → set BRAVE_SEARCH_API_KEY
 */

export async function search(query, opts = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY not set');

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(opts.numResults || 10));
  if (opts.country)  url.searchParams.set('country',  opts.country);     // e.g. 'sg', 'gb'
  if (opts.freshness) url.searchParams.set('freshness', opts.freshness); // pd | pw | pm | py
  if (opts.safesearch) url.searchParams.set('safesearch', opts.safesearch); // strict | moderate | off

  const res = await fetch(url.toString(), {
    headers: {
      'X-Subscription-Token': key,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Brave ${res.status}: ${err.slice(0, 160)}`);
  }
  const j = await res.json();

  return {
    results: (j.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      text: r.description || '',
      publishedDate: r.age,
      isFamilyFriendly: r.family_friendly,
    })),
    news: (j.news?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      text: r.description || '',
      publishedDate: r.age,
    })),
  };
}

export async function newsSearch(query, opts = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY not set');

  const url = new URL('https://api.search.brave.com/res/v1/news/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(opts.numResults || 10));
  if (opts.freshness) url.searchParams.set('freshness', opts.freshness);

  const res = await fetch(url.toString(), {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Brave news ${res.status}`);
  const j = await res.json();
  return (j.results || []).map(r => ({
    title: r.title,
    url: r.url,
    text: r.description || '',
    publishedDate: r.age,
    source: r.meta_url?.hostname,
  }));
}
