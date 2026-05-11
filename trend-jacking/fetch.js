/**
 * Trend-jacking fetcher — surface hot topics + generate per-client copy.
 *
 * Two-stage pipeline:
 *   A) Discover trends (Exa queries → LLM structuring → taxonomy tagging)
 *   B) Per-client: score relevance, generate ready-to-post copy in client voice
 *
 * Storage:
 *   data/_trending-topics-latest.json   global topic feed
 *   data/{clientId}/trend-jacks.json    per-client matched trends + copy
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const GLOBAL_FILE = join(DATA_DIR, '_trending-topics-latest.json');

// ── Exa ────────────────────────────────────────────

async function exaSearch(query, opts = {}) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set');
  const body = {
    query,
    type: opts.type || 'auto',
    numResults: opts.numResults || 6,
    contents: { text: { maxCharacters: opts.maxChars || 3500 } },
  };
  if (opts.category) body.category = opts.category;
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  return res.json();
}

// ── Stage A: Discover + structure trends ──────────

const DISCOVERY_PROMPT = `You are a cultural trend analyst. Extract the HOTTEST topics/trends/moments from the source articles — things creators could ride on THIS WEEK.

Include:
- Viral cultural moments (awards show moments, celebrity collabs, surprise announcements, e.g. "Justin Bieber at Coachella")
- Breaking news that dominated conversation (major events, scandals, product launches)
- Platform-native trends (viral formats, memes, challenges — but only if STILL rising, not decayed)
- Sports peaks (major matches, upsets, records)
- Business / tech moments (launches, IPOs, layoffs, viral product reveals)

EXCLUDE:
- Generic evergreen topics ("productivity tips")
- Things that peaked more than 10 days ago
- Topics too niche to resonate beyond a specific sub-culture (unless exceptional)

For EACH trend, return this structure (root key MUST be "trends"):
{
  "trends": [
    {
      "title": "Short headline name of the trend (max 10 words)",
      "summary": "2-3 sentence plain-English explanation of what happened + why people care",
      "category": "culture | news | sports | music | tech | politics | lifestyle | platform-meme",
      "virality": "peaking | rising | saturated | decaying",
      "daysSincePeak": <number, 0 if peaking now>,
      "shelfLifeDays": <remaining days this trend will feel fresh, 2-14>,
      "audienceResonance": ["Gen-Z", "Millennials", "creators", "B2B", "Singapore", "UK", etc.],
      "hookAngles": [
        "A specific reactive angle a creator could take — e.g. 'contrarian take'",
        "Another angle — e.g. 'educational breakdown'",
        "Third angle — e.g. 'personal anecdote tie-in'"
      ],
      "nicheMatches": ["business", "fitness", "property", "politics", "food", "fashion", "lifestyle", "tech", "education"],
      "sourceHint": "One sentence: what article/source flagged this"
    }
  ]
}

Aim for 12-18 trends total. Be specific — "Justin Bieber at Coachella" not "Coachella 2026".
Return ONLY the JSON. No prose, no code fences.`;

async function structureTrends(articles) {
  const blob = articles
    .slice(0, 15)
    .map((a, i) => `### Article ${i + 1}: ${a.title}\nURL: ${a.url}\n${(a.text || '').slice(0, 2500)}`)
    .join('\n\n');

  const user = `Extract trending topics from these articles. Return the JSON shape described.\n\n${blob}`;
  const raw = await callLLM(user, 'trend-jack-discover', {
    maxTokens: 6000,
    tier: 'premium',
    model: process.env.TREND_JACK_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.search(/[{\[]/);
  if (start > 0) cleaned = cleaned.slice(start);

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { console.error('[trend-jack] parse failed:', raw.slice(0, 400)); return []; }

  // Accept multiple root-key variations + walk for any array of objects with reasonable fields
  let list = Array.isArray(parsed) ? parsed : null;
  if (!list && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const sample = v[0];
        if (sample.title || sample.name || sample.headline || sample.trend || sample.topic || sample.event) {
          list = v;
          console.log(`  [trend-jack] Using key "${k}" (${v.length} items, sample keys: ${Object.keys(sample).slice(0,6).join(',')})`);
          break;
        }
      }
    }
  }
  if (!list) {
    console.error('[trend-jack] No list found. Root keys:', Object.keys(parsed||{}));
    console.error('[trend-jack] Raw start:', raw.slice(0, 600));
    return [];
  }

  return list.map((t, i) => {
    const title = t.title || t.name || t.headline || t.trend || t.topic || t.event;
    if (!title) return null;
    return {
      id: `trend-${Date.now()}-${i}`,
      title,
      summary: t.summary || t.description || t.context || t.what_happened || '',
      category: (t.category || t.type || t.bucket || 'culture').toLowerCase(),
      virality: (t.virality || t.trend_status || t.status || 'rising').toLowerCase(),
      daysSincePeak: Number(t.daysSincePeak ?? t.days_since_peak ?? t.daysOld) || 0,
      shelfLifeDays: Number(t.shelfLifeDays ?? t.shelf_life_days ?? t.expiresInDays) || 5,
      audienceResonance: arr(t.audienceResonance || t.audience_resonance || t.audiences || t.demographics),
      hookAngles: arr(t.hookAngles || t.hook_angles || t.angles || t.takes),
      nicheMatches: arr(t.nicheMatches || t.niche_matches || t.niches || t.relevant_niches).map(s => s.toLowerCase()),
      sourceHint: t.sourceHint || t.source_hint || t.source || '',
    };
  }).filter(Boolean);
}

function arr(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean);
  if (typeof x === 'string') return x.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  return [];
}

// Enrichment for thin trend records — per-trend LLM call to flesh out missing fields
async function enrichTrend(trend) {
  const user = `Trend: "${trend.title}"

Existing details (some may be empty): ${JSON.stringify(trend).slice(0, 500)}

Fill in the missing strategic detail. Return ONLY JSON with these EXACT keys:
{
  "summary": "2-3 sentences: what happened + why it's trending right now",
  "category": "culture | news | sports | music | tech | politics | lifestyle | platform-meme",
  "virality": "peaking | rising | saturated | decaying",
  "shelfLifeDays": 5,
  "audienceResonance": ["Gen-Z", "Millennials", "Singapore", etc.],
  "hookAngles": ["3 short angle phrases like 'contrarian take' or 'educational breakdown'"],
  "nicheMatches": ["business", "fitness", "property", "education", "food", etc.],
  "sourceHint": "one sentence — where this trend lives"
}

Be specific. No placeholders. Return ONLY the JSON object.`;

  const raw = await callLLM(user, 'trend-enrich', {
    maxTokens: 600,
    tier: 'premium',
    model: process.env.TREND_JACK_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const s = cleaned.search(/[{\[]/);
  if (s > 0) cleaned = cleaned.slice(s);

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || trend.summary,
      category: (parsed.category || trend.category || 'culture').toLowerCase(),
      virality: (parsed.virality || trend.virality || 'rising').toLowerCase(),
      shelfLifeDays: Number(parsed.shelfLifeDays) || trend.shelfLifeDays || 5,
      audienceResonance: arr(parsed.audienceResonance),
      hookAngles: arr(parsed.hookAngles),
      nicheMatches: arr(parsed.nicheMatches).map(s => s.toLowerCase()),
      sourceHint: parsed.sourceHint || trend.sourceHint,
    };
  } catch {
    return null;
  }
}

// ── Public: refresh global trend feed ─────────────

export async function refreshTrends() {
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const queries = [
    `top viral moments trending this week ${month}`,
    `breaking news dominating social media right now`,
    `trending cultural moments creators talking about ${month}`,
    `viral on TikTok Instagram today what happened`,
    `major news story creator content opportunity`,
    `celebrity viral moment this week awards concert`,
    `product launch reveal going viral ${month}`,
    `sports moment viral upset record ${month}`,
    `tech drop AI release trending creator coverage`,
    // Regional anchors since many clients are SG/UK
    `Singapore trending news viral social media ${month}`,
    `UK viral news creator opportunity ${month}`,
  ];

  console.log(`[trend-jack] Running ${queries.length} Exa searches…`);
  const articles = [];
  for (const q of queries) {
    try {
      const res = await exaSearch(q, { numResults: 5 });
      for (const r of (res.results || [])) {
        if (r.text && r.text.length > 200) {
          articles.push({ title: r.title, url: r.url, text: r.text });
        }
      }
    } catch (err) {
      console.log(`  [trend-jack] Exa "${q.slice(0, 40)}…" failed: ${err.message}`);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const unique = articles.filter(a => seen.has(a.url) ? false : (seen.add(a.url), true));
  console.log(`[trend-jack] Got ${unique.length} unique articles`);

  let trends = await structureTrends(unique);
  console.log(`[trend-jack] Extracted ${trends.length} trends`);

  // Backfill thin trends — per-trend enrichment for ones missing summary/niches/hooks
  const needsFill = trends.filter(t => !t.summary || !(t.nicheMatches||[]).length || !(t.hookAngles||[]).length);
  if (needsFill.length) {
    console.log(`[trend-jack] Enriching ${needsFill.length} thin trends...`);
    for (const t of needsFill) {
      try {
        const fill = await enrichTrend(t);
        if (fill) Object.assign(t, fill);
      } catch (err) {
        console.log(`  [enrich] "${t.title}" failed: ${err.message?.slice(0,80)}`);
      }
    }
  }

  const payload = {
    refreshedAt: new Date().toISOString(),
    month,
    sourceCount: unique.length,
    count: trends.length,
    trends,
    sources: unique.slice(0, 15).map(a => ({ title: a.title, url: a.url })),
  };

  if (!existsSync(dirname(GLOBAL_FILE))) mkdirSync(dirname(GLOBAL_FILE), { recursive: true });
  writeFileSync(GLOBAL_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

export function getTrends() {
  if (!existsSync(GLOBAL_FILE)) return null;
  try { return JSON.parse(readFileSync(GLOBAL_FILE, 'utf-8')); }
  catch { return null; }
}

// ── Stage B: Per-client relevance + copywriting ──

/**
 * For a single client, score each trend's relevance + generate ready-to-post copy.
 * Relevance is keyword overlap between client's niche/pillars and trend's nicheMatches + hookAngles.
 */
export async function generateTrendJacksForClient(clientId) {
  const clientsFile = join(ROOT, 'clients.json');
  const all = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = all.find(c => c.id === clientId);
  if (!client) throw new Error('Client not found');

  const trendsData = getTrends();
  if (!trendsData?.trends?.length) throw new Error('No trends yet — run /api/trend-jacking/refresh first');

  // Pull client's tone signals
  const brandReport = readJson(join(DATA_DIR, clientId, 'brand-report-latest.json'));
  const posts = readJson(join(DATA_DIR, clientId, 'posts-latest.json'));
  const tone = brandReport?.structured?.tone_and_pacing?.overall_tone || 'conversational';
  const archetype = brandReport?.structured?.brand_identity?.brand_archetype || 'unspecified';
  const captionSamples = extractCaptionSamples(posts, 5);

  // Stage B1: relevance scoring
  const scored = trendsData.trends.map(t => ({
    ...t,
    relevanceScore: scoreRelevance(client, t),
  }));
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Stage B2: generate copy for top 6 matches (threshold 40)
  const topTrends = scored.filter(t => t.relevanceScore >= 40).slice(0, 6);
  console.log(`[trend-jack/${clientId}] ${topTrends.length} relevant trends — generating copy…`);

  for (const t of topTrends) {
    try {
      t.copyIdeas = await generateCopy(t, client, tone, archetype, captionSamples);
    } catch (err) {
      t.copyIdeas = [];
      t.copyError = err.message;
    }
  }

  const payload = {
    clientId,
    clientName: client.name,
    refreshedAt: new Date().toISOString(),
    basedOnTrendsAt: trendsData.refreshedAt,
    totalTrends: scored.length,
    relevantTrends: topTrends.length,
    tone,
    archetype,
    matches: topTrends,
    alsoSeen: scored.slice(topTrends.length, topTrends.length + 8).map(t => ({
      id: t.id, title: t.title, relevanceScore: t.relevanceScore,
    })),
  };

  const clientDir = join(DATA_DIR, clientId);
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });
  writeFileSync(join(clientDir, 'trend-jacks.json'), JSON.stringify(payload, null, 2));
  return payload;
}

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

function extractCaptionSamples(posts, limit = 5) {
  if (!posts?.platforms) return [];
  const all = [];
  for (const list of Object.values(posts.platforms)) {
    const arr = Array.isArray(list) ? list : [];
    for (const p of arr) if (p.caption) all.push(p.caption.slice(0, 200));
  }
  return all.slice(0, limit);
}

function scoreRelevance(client, trend) {
  const clientText = [
    client.niche || '',
    client.geography || '',
    ...(client.contentPillars || []),
    ...(client.competitors || []).map(c => c.category || ''),
  ].join(' ').toLowerCase();

  let score = 0;

  // Niche-match keyword overlap
  for (const niche of trend.nicheMatches || []) {
    if (clientText.includes(niche)) score += 25;
  }

  // Geography bonus
  for (const geo of trend.audienceResonance || []) {
    if (clientText.toLowerCase().includes(geo.toLowerCase())) score += 15;
  }

  // Virality bonus
  if (trend.virality === 'peaking') score += 10;
  else if (trend.virality === 'rising') score += 15;
  else if (trend.virality === 'saturated') score -= 10;
  else if (trend.virality === 'decaying') score -= 25;

  // Category match (fuzzy)
  const cat = (trend.category || '').toLowerCase();
  if (clientText.includes(cat)) score += 10;

  // Generic culture/news always get a floor boost (everyone can ride them)
  if (['culture', 'news', 'music'].includes(cat)) score += 10;

  return Math.max(0, Math.min(100, score));
}

// ── Copywriting ────────────────────────────────────

async function generateCopy(trend, client, tone, archetype, captionSamples) {
  const prompt = `You are writing trend-jacking copy for a specific creator in THEIR voice.

TREND: ${trend.title}
Context: ${trend.summary}
Category: ${trend.category} · Virality: ${trend.virality}
Suggested hook angles: ${(trend.hookAngles || []).join(' | ')}

CREATOR: ${client.name}
Niche: ${client.niche || 'not specified'}
Geography: ${client.geography || 'global'}
Brand archetype: ${archetype}
Tone descriptor: ${tone}

Examples of how they actually write (from their real posts):
${captionSamples.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

Produce 3 trend-jacking content ideas, each in THIS creator's voice (match their caption style — slang, sentence length, emoji density, whether they speak in first-person/third/hot-take/explainer).

Return ONLY JSON with root key "ideas":
{
  "ideas": [
    {
      "angle": "Which hook angle this uses (e.g. 'contrarian take' or 'personal tie-in')",
      "format": "Reel | Carousel | LinkedIn post | TikTok",
      "hook": "The opening line — specific, in the creator's voice (max 18 words)",
      "body": "The rest of the caption, 40-80 words, matching their style. NO em-dashes in the caption text itself; only use hyphens.",
      "cta": "One line CTA that fits their style",
      "riskLevel": "safe | moderate | spicy",
      "whyItWorks": "One sentence on why this trend-jack fits this creator specifically"
    }
  ]
}

Rules:
- Write like THIS creator, not like ChatGPT. No "dive into", "let's unpack", "here's the thing".
- British English if niche mentions UK/SG, otherwise neutral.
- Riff off trend + creator's niche — don't just summarise the trend.
- If trend doesn't genuinely fit, return {"ideas": []} (empty) — don't force it.`;

  const raw = await callLLM(prompt, 'trend-jack-copy', {
    maxTokens: 1500,
    tier: 'premium',
    model: process.env.TREND_JACK_COPY_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const s = cleaned.search(/[{\[]/);
  if (s > 0) cleaned = cleaned.slice(s);
  try {
    const parsed = JSON.parse(cleaned);
    return parsed.ideas || parsed.content_ideas || [];
  } catch {
    return [];
  }
}

export function getTrendJacksForClient(clientId) {
  const f = join(DATA_DIR, clientId, 'trend-jacks.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf-8')); }
  catch { return null; }
}
