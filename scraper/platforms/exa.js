/**
 * Exa API — web search for competitor intelligence & trend detection
 *
 * Uses Exa's deep search with structured outputs to find:
 * 1. Competitor news & mentions
 * 2. Industry trends & viral topics
 * 3. Content gaps & opportunities
 *
 * Endpoints used:
 *   POST /search  (type: "deep" for structured, "auto" for fast)
 *   POST /contents (for URL content extraction)
 */

const EXA_BASE = 'https://api.exa.ai';

function getKey() {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set in .env.local');
  return key;
}

async function exaFetch(endpoint, body) {
  const res = await fetch(`${EXA_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-api-key': getKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Exa ${endpoint} error (${res.status}): ${errText.slice(0, 200)}`);
  }

  return res.json();
}

// ── Quick search (fast, for real-time lookups) ──

export async function exaSearch(query, opts = {}) {
  const body = {
    query,
    type: opts.type || 'auto',
    numResults: opts.numResults || 10,
    contents: {
      text: { maxCharacters: opts.maxChars || 5000 },
    },
  };

  if (opts.category) body.category = opts.category;
  if (opts.includeDomains) body.includeDomains = opts.includeDomains;
  if (opts.excludeDomains) body.excludeDomains = opts.excludeDomains;

  return exaFetch('/search', body);
}

// ── Deep search with structured output ──

export async function exaDeepSearch(query, outputSchema, opts = {}) {
  const body = {
    query,
    type: 'deep',
    numResults: opts.numResults || 10,
    outputSchema,
    contents: {
      highlights: { maxCharacters: opts.maxChars || 4000 },
    },
  };

  if (opts.category) body.category = opts.category;
  if (opts.includeDomains) body.includeDomains = opts.includeDomains;

  return exaFetch('/search', body);
}

// ── Get contents for known URLs ──

export async function exaGetContents(urls, opts = {}) {
  return exaFetch('/contents', {
    urls,
    text: { maxCharacters: opts.maxChars || 10000 },
  });
}

// ═══════════════════════════════════════════════════
// ██  COMPETITOR & TREND RESEARCH FUNCTIONS
// ═══════════════════════════════════════════════════

/**
 * Find recent news and mentions for a competitor
 */
export async function searchCompetitorNews(competitorName, industry) {
  const query = `"${competitorName}" ${industry || ''} news social media latest`.trim();

  try {
    const results = await exaSearch(query, {
      type: 'auto',
      numResults: 5,
      category: 'news',
      maxChars: 3000,
    });

    return (results.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      text: (r.text || '').slice(0, 500),
      publishedDate: r.publishedDate || null,
      score: r.score || 0,
    }));
  } catch (err) {
    console.log(`  [EXA] Competitor news search failed: ${err.message}`);
    return [];
  }
}

/**
 * Detect trending topics in an industry/niche
 */
export async function searchTrendingTopics(niche, country) {
  const query = `trending ${niche} topics ${country || 'Singapore'} 2026 social media viral`;

  const outputSchema = {
    type: 'object',
    description: `Trending topics in ${niche} space`,
    required: ['trends'],
    properties: {
      trends: {
        type: 'array',
        description: 'List of trending topics',
        items: {
          type: 'object',
          required: ['topic', 'description'],
          properties: {
            topic: { type: 'string', description: 'The trending topic name' },
            description: { type: 'string', description: 'Why this topic is trending and its relevance' },
            platform: { type: 'string', description: 'Which platform it is trending on (TikTok, Instagram, LinkedIn, etc.)' },
            viralPotential: { type: 'string', description: 'High, Medium, or Low viral potential' },
          },
        },
      },
    },
  };

  try {
    const results = await exaDeepSearch(query, outputSchema, {
      numResults: 8,
      maxChars: 4000,
    });

    return {
      trends: results.output?.content?.trends || [],
      grounding: results.output?.grounding || [],
      sources: (results.results || []).map(r => ({ title: r.title, url: r.url })),
    };
  } catch (err) {
    console.log(`  [EXA] Trend search failed: ${err.message}`);
    return { trends: [], grounding: [], sources: [] };
  }
}

/**
 * Research content ideas for a specific topic
 */
export async function researchContentIdeas(topic, clientName, platform) {
  const query = `${topic} content ideas ${platform || 'social media'} viral engagement tips 2026`;

  const outputSchema = {
    type: 'object',
    description: 'Content ideas and strategies',
    required: ['ideas'],
    properties: {
      ideas: {
        type: 'array',
        description: 'Actionable content ideas',
        items: {
          type: 'object',
          required: ['title', 'format'],
          properties: {
            title: { type: 'string', description: 'Content idea title' },
            format: { type: 'string', description: 'Content format (Reel, Carousel, LinkedIn Post, TikTok, etc.)' },
            hook: { type: 'string', description: 'Opening hook to grab attention' },
            whyItWorks: { type: 'string', description: 'Why this content performs well based on current trends' },
          },
        },
      },
      trendContext: {
        type: 'string',
        description: 'Brief overview of why this topic is relevant right now',
      },
    },
  };

  try {
    const results = await exaDeepSearch(query, outputSchema, {
      numResults: 8,
      maxChars: 3000,
    });

    return {
      ideas: results.output?.content?.ideas || [],
      trendContext: results.output?.content?.trendContext || '',
      sources: (results.results || []).map(r => ({ title: r.title, url: r.url })),
    };
  } catch (err) {
    console.log(`  [EXA] Content research failed: ${err.message}`);
    return { ideas: [], trendContext: '', sources: [] };
  }
}

/**
 * Find competitor social media strategies & analyses
 */
export async function searchCompetitorStrategies(competitors, niche) {
  const compNames = competitors.slice(0, 5).map(c => c.name).join(', ');
  const query = `${compNames} social media strategy analysis ${niche} content performance`;

  try {
    const results = await exaSearch(query, {
      type: 'auto',
      numResults: 8,
      maxChars: 5000,
    });

    return (results.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      text: (r.text || '').slice(0, 800),
      publishedDate: r.publishedDate || null,
    }));
  } catch (err) {
    console.log(`  [EXA] Strategy search failed: ${err.message}`);
    return [];
  }
}

/**
 * Full competitor + trend research bundle (used by scraper)
 */
export async function runTrendResearch(client, competitors) {
  if (!process.env.EXA_API_KEY) {
    console.log('  [EXA] No API key — skipping trend research');
    return null;
  }

  // Determine niche from client data
  const niche = inferNiche(client, competitors);
  console.log(`  [EXA] Running trend research for "${client.name}" in ${niche}...`);

  const [trendsResult, compNewsResult, strategiesResult] = await Promise.allSettled([
    searchTrendingTopics(niche, 'Singapore'),
    Promise.allSettled(
      competitors.slice(0, 3).map(c => searchCompetitorNews(c.name, niche))
    ),
    searchCompetitorStrategies(competitors, niche),
  ]);

  const trends = trendsResult.status === 'fulfilled' ? trendsResult.value : null;
  const compNews = compNewsResult.status === 'fulfilled'
    ? compNewsResult.value.map(r => r.status === 'fulfilled' ? r.value : [])
    : [];
  const strategies = strategiesResult.status === 'fulfilled' ? strategiesResult.value : null;

  // Flatten competitor news
  const allCompNews = [];
  competitors.slice(0, 3).forEach((c, i) => {
    for (const article of (compNews[i] || [])) {
      allCompNews.push({ ...article, competitor: c.name });
    }
  });

  const result = {
    clientId: client.id,
    researchedAt: new Date().toISOString(),
    niche,
    trends,
    competitorNews: allCompNews,
    strategies,
  };

  // Generate alerts for significant findings
  const alerts = [];

  // Competitor in the news
  for (const article of allCompNews) {
    if (article.score > 0.8) {
      alerts.push({
        type: 'trend_detected',
        severity: 'medium',
        competitor: article.competitor,
        platform: 'web',
        message: `${article.competitor} mentioned in: "${article.title}"`,
        data: { url: article.url, title: article.title },
      });
    }
  }

  // High-potential trends
  for (const trend of (trends.trends || [])) {
    if (trend.viralPotential === 'High') {
      alerts.push({
        type: 'trend_detected',
        severity: 'medium',
        competitor: 'Industry',
        platform: trend.platform || 'web',
        message: `Trending in ${niche}: "${trend.topic}" — ${trend.description?.slice(0, 100)}`,
        data: { topic: trend.topic, platform: trend.platform },
      });
    }
  }

  return { ...result, alerts };
}

function inferNiche(client, competitors) {
  // Infer from competitor categories/parties
  const categories = competitors
    .map(c => c.party || c.category || '')
    .filter(Boolean);

  if (categories.some(c => c.includes('PAP') || c.includes('Party') || c.includes('political'))) {
    return 'Singapore politics';
  }
  if (categories.some(c => c.includes('Physio') || c.includes('Fitness') || c.includes('health'))) {
    return 'physiotherapy and health Singapore';
  }
  // Fallback
  return `${client.name} industry`;
}
