/**
 * Comment analysis pipeline
 *
 *   fetchPostUrls(clientId)
 *     → scrapeIGComments / scrapeTikTokComments
 *     → dedupeComments (near-duplicate removal)
 *     → classifyBatch (per-comment intent/sentiment via LLM)
 *     → clusterByTopic (group similar comments)
 *     → summariseCluster (generate content brief per cluster)
 *     → writeCommentIntel (data/{clientId}/comment-intel.json)
 *
 * Designed to be called per-client; runner iterates clients.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeIGComments, scrapeTikTokComments, estimateApifyCost } from './apify.js';
import { scrapeTikTokCommentsViaSocialKit, estimateSocialKitCost } from './socialkit.js';
import { classifyWithFallback, costFromUsage } from './llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

// ── Post URL extraction from existing scrape output ──

function getPostUrls(clientId, maxPerPlatform = 100) {
  const postsFile = join(DATA_DIR, clientId, 'posts-latest.json');
  if (!existsSync(postsFile)) return { ig: [], tt: [] };

  let posts;
  try {
    posts = JSON.parse(readFileSync(postsFile, 'utf-8'));
  } catch {
    return { ig: [], tt: [] };
  }

  const ig = [];
  const tt = [];

  // posts-latest.json shape: { platforms: { instagram: [...], tiktok: [...], ... } }
  // Also handle legacy flat-array or .posts subkey shapes defensively.
  const platforms = posts.platforms || posts;
  const flat = Array.isArray(posts) ? posts : [].concat(
    Array.isArray(platforms.instagram) ? platforms.instagram : (platforms.instagram?.posts || []),
    Array.isArray(platforms.tiktok)    ? platforms.tiktok    : (platforms.tiktok?.posts    || []),
    Array.isArray(platforms.facebook)  ? platforms.facebook  : (platforms.facebook?.posts  || []),
    Array.isArray(platforms.linkedin)  ? platforms.linkedin  : (platforms.linkedin?.posts  || []),
    posts.posts || []
  );

  for (const p of flat) {
    const url = p.url || p.postUrl || p.videoUrl || '';
    if (!url) continue;
    if (url.includes('instagram.com') && ig.length < maxPerPlatform) ig.push(url);
    else if (url.includes('tiktok.com') && tt.length < maxPerPlatform) tt.push(url);
  }

  return { ig, tt };
}

// ── Near-duplicate dedupe ───────────────────────────

function normaliseText(t) {
  return (t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

function dedupeComments(comments) {
  const seen = new Set();
  const out = [];
  for (const c of comments) {
    const key = normaliseText(c.text).slice(0, 80);
    if (!key || key.length < 3) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ── LLM classification (batched) ────────────────────

const CLASSIFY_SYSTEM = `You analyse social media comments. For each comment, output JSON with:
- sentiment: "positive" | "neutral" | "negative" | "mixed"
- intent: one of ["fan_request", "question", "praise", "hate", "disagreement", "spam", "other"]
- topic: short noun phrase (max 6 words) describing what the comment is about
- actionable: true if this comment could inspire content (fan wants X, confused about Y, haters claim Z), false otherwise

Return a JSON object with "results" array, one entry per comment, in the same order as input. No prose.`;

const CLASSIFY_SCHEMA = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sentiment', 'intent', 'topic', 'actionable'],
        properties: {
          sentiment: { type: 'string' },
          intent: { type: 'string' },
          topic: { type: 'string' },
          actionable: { type: 'boolean' },
        },
      },
    },
  },
};

async function classifyBatch(batch) {
  const numbered = batch.map((c, i) => `${i + 1}. ${c.text.slice(0, 200)}`).join('\n');
  const user = `Classify these ${batch.length} comments:\n\n${numbered}`;

  const { text, usage } = await classifyWithFallback({
    system: CLASSIFY_SYSTEM,
    user,
    jsonSchema: CLASSIFY_SCHEMA,
    maxTokens: 50 * batch.length,
  });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Classifier returned invalid JSON');
  }

  const results = parsed.results || [];
  return { results, usage, cost: costFromUsage(usage) };
}

// ── Cluster by topic ────────────────────────────────

function clusterByTopic(enrichedComments) {
  const buckets = new Map();
  for (const c of enrichedComments) {
    if (!c.actionable) continue;
    const key = (c.topic || '').toLowerCase().trim();
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }

  const clusters = [...buckets.entries()].map(([topic, items]) => ({
    topic,
    size: items.length,
    intent: dominantIntent(items),
    sentiment: dominantSentiment(items),
    examples: items.slice(0, 3).map(c => c.text.slice(0, 140)),
    platforms: [...new Set(items.map(c => c.platform))],
  }));

  clusters.sort((a, b) => b.size - a.size);
  return clusters;
}

function dominantIntent(items) {
  const counts = {};
  for (const i of items) counts[i.intent] = (counts[i.intent] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
}

function dominantSentiment(items) {
  const counts = {};
  for (const i of items) counts[i.sentiment] = (counts[i.sentiment] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
}

// ── Summarise cluster → content idea ────────────────

const SUMMARY_SYSTEM = `You generate short-form video content briefs from audience comments. Input: a cluster of similar comments about one topic. Output JSON with:
- type: one of ["fan_request", "hate_comment_response", "faq", "controversy"]
- title: 6-10 word content idea title
- hook: an opening line (max 15 words) that would grab attention
- format: "Reel" | "TikTok" | "Carousel" | "Response video"
- whyItWorks: one sentence explaining audience fit

Return the JSON object only. No prose.`;

const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['type', 'title', 'hook', 'format', 'whyItWorks'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    hook: { type: 'string' },
    format: { type: 'string' },
    whyItWorks: { type: 'string' },
  },
};

async function summariseCluster(cluster) {
  const user = `Topic: ${cluster.topic}
Dominant intent: ${cluster.intent}
Dominant sentiment: ${cluster.sentiment}
Cluster size: ${cluster.size} similar comments
Platforms: ${cluster.platforms.join(', ')}

Sample comments:
${cluster.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Generate a content brief.`;

  const { text, usage } = await classifyWithFallback({
    system: SUMMARY_SYSTEM,
    user,
    jsonSchema: SUMMARY_SCHEMA,
    maxTokens: 500,       // more room for Claude to do richer briefs
    tier: 'premium',      // route through Anthropic Sonnet 4 first
  });

  try {
    return { brief: JSON.parse(text), cost: costFromUsage(usage) };
  } catch {
    return { brief: null, cost: costFromUsage(usage) };
  }
}

// ── Main per-client pipeline ────────────────────────

export async function analyseClient(client, opts = {}) {
  const clientId = client.id;
  const limit = opts.limitPerPlatform || 100;
  const batchSize = opts.batchSize || 10;
  const maxClusters = opts.maxClusters || 8;

  console.log(`\n─ [COMMENTS] ${client.name} (${clientId}) ─`);

  // 1. Fetch post URLs from existing scrape
  const { ig, tt } = getPostUrls(clientId, limit);
  console.log(`  Posts found: IG=${ig.length}, TikTok=${tt.length}`);
  if (!ig.length && !tt.length) {
    console.log('  No post URLs — skip (run scraper first)');
    return null;
  }

  // 2. Scrape comments
  //    TikTok: try SocialKit first (user has credits), fall back to Apify
  //    IG: Apify only (SocialKit has no IG comments endpoint)
  let ttComments = [];
  let ttSource = 'none';
  if (tt.length) {
    if (process.env.SOCIALKIT_API_KEY) {
      try {
        ttComments = await scrapeTikTokCommentsViaSocialKit(tt);
        ttSource = 'socialkit';
      } catch (err) {
        console.log(`  [SK] TikTok failed: ${err.message} — falling back to Apify`);
      }
    }
    if (!ttComments.length && process.env.APIFY_TOKEN) {
      const apifyTT = await scrapeTikTokComments(tt, 50);
      if (apifyTT.length) { ttComments = apifyTT; ttSource = 'apify'; }
    }
  }

  const igComments = ig.length && process.env.APIFY_TOKEN ? await scrapeIGComments(ig, 50) : [];
  const igSource = igComments.length ? 'apify' : 'none';

  const skCost = ttSource === 'socialkit' ? estimateSocialKitCost(tt.length) : 0;
  const apifyCost = estimateApifyCost(igComments.length, ttSource === 'apify' ? ttComments.length : 0).total;
  const totalScrapeCost = skCost + apifyCost;
  console.log(`  Comments scraped: IG=${igComments.length}(${igSource}), TikTok=${ttComments.length}(${ttSource}) (~$${totalScrapeCost.toFixed(3)})`);

  // 3. Dedupe
  let all = dedupeComments([...igComments, ...ttComments]);
  console.log(`  After dedupe: ${all.length}`);
  if (!all.length) return null;

  // Cap for cost safety — never classify more than 500 per client per run
  const HARD_CAP = opts.hardCap || 500;
  if (all.length > HARD_CAP) {
    // Keep most-liked comments
    all.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    all = all.slice(0, HARD_CAP);
    console.log(`  Capped to ${HARD_CAP} most-engaged comments`);
  }

  // 4. Classify in batches
  let llmCost = 0;
  const enriched = [];
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    try {
      const { results, cost } = await classifyBatch(batch);
      llmCost += cost;
      batch.forEach((c, j) => {
        if (results[j]) enriched.push({ ...c, ...results[j] });
      });
    } catch (err) {
      console.log(`  [CLASSIFY] batch ${i / batchSize + 1} failed: ${err.message}`);
    }
  }
  console.log(`  Classified: ${enriched.length} / ${all.length} (LLM cost ~$${llmCost.toFixed(4)})`);

  // 5. Cluster
  const clusters = clusterByTopic(enriched).slice(0, maxClusters);
  console.log(`  Clusters: ${clusters.length}`);

  // 6. Summarise top clusters into briefs
  const contentIdeas = [];
  let summaryCost = 0;
  for (const cluster of clusters) {
    if (cluster.size < 2) continue; // skip singletons
    try {
      const { brief, cost } = await summariseCluster(cluster);
      summaryCost += cost;
      if (brief) {
        contentIdeas.push({
          ...brief,
          topic: cluster.topic,
          commentCount: cluster.size,
          sentiment: cluster.sentiment,
          platforms: cluster.platforms,
          examples: cluster.examples,
        });
      }
    } catch (err) {
      console.log(`  [SUMMARY] cluster "${cluster.topic}" failed: ${err.message}`);
    }
  }

  // 7. Aggregate sentiment
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  for (const e of enriched) {
    sentimentCounts[e.sentiment] = (sentimentCounts[e.sentiment] || 0) + 1;
  }
  const total = Math.max(1, enriched.length);
  const sentiment = Object.fromEntries(
    Object.entries(sentimentCounts).map(([k, v]) => [k, Number((v / total).toFixed(3))])
  );

  const output = {
    clientId,
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    postsAnalysed: { ig: ig.length, tiktok: tt.length },
    commentCount: enriched.length,
    sentiment,
    contentIdeas,
    topQuestions: enriched
      .filter(c => c.intent === 'question' && c.actionable)
      .slice(0, 10)
      .map(c => ({ text: c.text, author: c.author, platform: c.platform })),
    hateComments: enriched
      .filter(c => c.intent === 'hate' || (c.sentiment === 'negative' && c.actionable))
      .slice(0, 10)
      .map(c => ({ text: c.text, author: c.author, platform: c.platform, topic: c.topic })),
    fanRequests: enriched
      .filter(c => c.intent === 'fan_request')
      .slice(0, 15)
      .map(c => ({ text: c.text, topic: c.topic, platform: c.platform })),
    costs: {
      socialkit: Number(skCost.toFixed(4)),
      apify: Number(apifyCost.toFixed(4)),
      llmClassify: Number(llmCost.toFixed(4)),
      llmSummary: Number(summaryCost.toFixed(4)),
      total: Number((skCost + apifyCost + llmCost + summaryCost).toFixed(4)),
    },
    sources: { instagram: igSource, tiktok: ttSource },
  };

  // 8. Write
  const outFile = join(DATA_DIR, clientId, 'comment-intel.json');
  if (!existsSync(dirname(outFile))) mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`  ✓ Saved ${outFile} (total cost ~$${output.costs.total.toFixed(4)})`);

  return output;
}
