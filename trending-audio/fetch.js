/**
 * Trending TikTok audio fetcher
 *
 * Data flow:
 *   1. Exa search for recent articles / listicles about "trending TikTok audio [month] [year]"
 *   2. Extract article text + titles
 *   3. LLM structures into canonical list: title, artist, vibe, best_for, video_style_suggestions
 *   4. Dedupe across sources
 *   5. Save to data/_trending-audio-latest.json (global, not per-client)
 *
 * Freshness: re-run weekly (or on demand via /api/trending-audio/refresh).
 *
 * No Apify dependency — works with just EXA_API_KEY + any LLM key.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_FILE = join(__dirname, '..', 'data', '_trending-audio-latest.json');

// ── Exa search ─────────────────────────────────────

async function exaSearch(query, opts = {}) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set');
  const body = {
    query,
    type: opts.type || 'auto',
    numResults: opts.numResults || 12,
    contents: { text: { maxCharacters: opts.maxChars || 5000 } },
    category: opts.category,
  };
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

// ── LLM structuring ────────────────────────────────

const SYSTEM_PROMPT = `You are a TikTok content strategist. Source articles list trending audio tracks — your job is to TAKE each named track and INVENT the strategic analysis around it, because the articles don't contain that analysis. You are synthesising, not copy-pasting.

For EACH track you identify in the articles, produce one record with these 8 fields. ALL 8 FIELDS ARE REQUIRED — do not substitute your own fields. Do not include raw stats from the article (views, likes, genre) except as flavour in "sourceHint".

Root key MUST be exactly "tracks" (lowercase, plural, no variation).

Schema — every record MUST match:
{
  "title":                 string — the track name
  "artist":                string — the performer (or "unknown" if not stated)
  "vibe":                  string — 2-3 descriptors with middle-dot separators, e.g. "moody · introspective · late-night aesthetic"
  "bestFor":               array of 3-5 short video-format phrases YOU CHOOSE based on the song's vibe
  "videoStyleSuggestions": array of 2-3 concrete shot/edit ideas YOU INVENT based on track tempo + mood
  "creatorArchetypes":     array of 2-4 creator types that would use this (fitness / B2B / lifestyle / food / etc.)
  "hookTiming":            string — when in the track the payoff hits (e.g. "0:08 vocal entry — place reveal here")
  "sourceHint":            string — one sentence on WHY it's trending right now (can reference article stats if notable)
}

Aim for 30-40 tracks in total — the articles collectively cover this many. Be thorough; skim every article.

Concrete example (this is ONE correct record — produce many more like it, with DIFFERENT tracks from the articles):
{
  "title": "voices",
  "artist": "Øneheart",
  "vibe": "moody · introspective · late-night aesthetic",
  "bestFor": ["moody aesthetic reel", "storytime voiceover", "photo dump montage", "rainy-city B-roll"],
  "videoStyleSuggestions": [
    "Open on rainy window, slow-zoom face reveal when vocals enter at 0:08",
    "Text-overlay storytime: place the twist on the bass drop"
  ],
  "creatorArchetypes": ["lifestyle creator", "B2B thought leader", "personal brand builder"],
  "hookTiming": "0:08 vocal entry — place reveal or CTA here",
  "sourceHint": "Dominates 8 countries simultaneously in April 2026 — highest single-sound cross-market penetration"
}

Return ONLY the JSON object { "tracks": [...] } — no prose, no code fences, no other root keys.`;

// ── Per-track song link resolution (TikTok sound → Spotify → YouTube) ──

async function resolveSongLinks(title, artist) {
  const links = { tiktok: '', spotify: '', youtube: '', appleMusic: '' };
  const combo = `${title} ${artist}`.replace(/\s+/g, ' ').trim().slice(0, 120);

  // Order: TikTok sound page (most relevant), Spotify, YouTube, Apple Music
  const probes = [
    { key: 'tiktok',     q: `"${title}" ${artist} site:tiktok.com/music OR site:tiktok.com/discover` },
    { key: 'spotify',    q: `"${title}" ${artist} site:open.spotify.com/track` },
    { key: 'youtube',    q: `"${title}" ${artist} site:youtube.com/watch OR site:youtube.com/shorts` },
    { key: 'appleMusic', q: `"${title}" ${artist} site:music.apple.com` },
  ];

  for (const { key, q } of probes) {
    try {
      const res = await exaSearch(q, { numResults: 3, maxChars: 200 });
      for (const r of (res.results || [])) {
        const url = r.url || '';
        if (key === 'tiktok' && /tiktok\.com\/(music|discover)/i.test(url)) {
          links.tiktok = url.split('?')[0];
          break;
        }
        if (key === 'spotify' && /open\.spotify\.com\/track/i.test(url)) {
          links.spotify = url.split('?')[0];
          break;
        }
        if (key === 'youtube' && /youtube\.com\/(watch|shorts)/i.test(url)) {
          links.youtube = url.split('&')[0];
          break;
        }
        if (key === 'appleMusic' && /music\.apple\.com/i.test(url)) {
          links.appleMusic = url.split('?')[0];
          break;
        }
      }
    } catch { /* best effort */ }
  }
  return links;
}

// ── Step 2: per-track analysis (LLM synthesises vibe + best-for + style) ──

const ANALYSIS_PROMPT = `You are a TikTok content strategist. Given a single track name and artist, INVENT the strategic analysis a creator needs to use this track effectively. You are not extracting from any source — you are synthesising based on what you know about the track's mood, tempo, and how it gets used.

Return ONLY valid JSON in this exact shape (root keys must match exactly):
{
  "vibe": "2-3 mood descriptors with middle-dot separators (e.g. 'moody · introspective · late-night aesthetic')",
  "bestFor": ["3-5 short video format phrases"],
  "videoStyleSuggestions": ["2-3 specific shot/edit ideas tied to the track's beat or mood"],
  "creatorArchetypes": ["2-4 creator types"],
  "hookTiming": "when in the track the payoff hits (e.g. '0:08 vocal entry — place reveal here')",
  "sourceHint": "one sentence on why creators use this sound"
}

Be specific and actionable. NEVER return empty strings or empty arrays. If you genuinely don't know the track, make educated guesses based on the title.`;

async function analyseTrack(title, artist, sourceContext) {
  // Force JSON with explicit system prompt + repeat schema requirements in user message
  const user = `Track: "${title}" by ${artist}
Context from articles: ${sourceContext.slice(0, 400)}

INSTRUCTIONS:
Return ONLY a JSON object with these EXACT keys at root level:
{
  "vibe": "2-3 mood descriptors",
  "bestFor": ["array of strings"],
  "videoStyleSuggestions": ["array of strings"],
  "creatorArchetypes": ["array of strings"],
  "hookTiming": "when beat/vocal hits",
  "sourceHint": "one sentence on trending reason"
}

Do NOT nest under any other key. Return the flat object. No prose.`;

  try {
    const raw = await callLLM(user, 'audio-analyse', {
      maxTokens: 700,
      tier: 'premium',
      model: process.env.TRENDING_AUDIO_MODEL || 'claude-sonnet-4-20250514',
    });
    let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = cleaned.search(/[{\[]/);
    if (start > 0) cleaned = cleaned.slice(start);

    let json;
    try { json = JSON.parse(cleaned); }
    catch {
      console.log(`  [audio-analyse] "${title}" JSON parse failed. Raw start: ${raw.slice(0,180)}`);
      return null;
    }

    // Handle nested shapes — Sonnet sometimes wraps in {analysis:{...}} or {result:{...}}
    const data = json.analysis || json.result || json.data || json;

    const result = {
      vibe: data.vibe || data.mood || data.tone || '',
      bestFor: arr(data.bestFor || data.best_for || data.formats || data.use_cases),
      videoStyleSuggestions: arr(data.videoStyleSuggestions || data.video_style_suggestions || data.style_ideas || data.suggestions || data.video_ideas),
      creatorArchetypes: arr(data.creatorArchetypes || data.creator_archetypes || data.creator_types || data.fits),
      hookTiming: data.hookTiming || data.hook_timing || data.timing || '',
      sourceHint: data.sourceHint || data.source_hint || data.why_trending || data.reason || '',
    };

    // Debug: log if result has empty fields
    if (!result.vibe && !result.bestFor.length) {
      console.log(`  [audio-analyse] "${title}" returned empty fields. Parsed keys: ${Object.keys(data).join(',')}. Raw: ${raw.slice(0,200)}`);
    }

    return result;
  } catch (err) {
    console.log(`  [audio-analyse] "${title}" failed: ${err.message?.slice(0, 80)}`);
    return null;
  }
}

async function structureArticles(articles) {
  const combined = articles
    .slice(0, 8)
    .map((a, i) => `### Article ${i + 1}: ${a.title || ''}\nURL: ${a.url}\n${(a.text || '').slice(0, 3500)}`)
    .join('\n\n');

  const user = `Extract all trending TikTok audio tracks mentioned in these articles. Return the JSON described in the system prompt.\n\n${combined}`;

  const raw = await callLLM(user, 'trending-audio-structure', {
    maxTokens: 4000,
    // Quality matters — use premium for structured output
    tier: 'premium',
    model: process.env.TRENDING_AUDIO_MODEL || 'claude-sonnet-4-20250514',
  });

  // Strip code fences + leading prose
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Some models prepend explanatory text — find the first '{' or '[' and extract from there
  const jsonStart = cleaned.search(/[{\[]/);
  if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);

  // Some models append trailing prose — find the last balanced } or ]
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[trending-audio] JSON parse failed:', err.message);
    console.error('[trending-audio] Raw response (first 800 chars):', raw.slice(0, 800));
    return [];
  }

  // Accept multiple root shapes
  // If already an array
  let rawTracks = Array.isArray(parsed) ? parsed : null;

  // Find first array-valued property whose contents look like tracks
  if (!rawTracks && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const sample = v[0];
        if (sample.title || sample.track_name || sample.name || sample.song || sample.song_title) {
          rawTracks = v;
          console.log(`  [trending-audio] Using array key "${k}" (${v.length} items)`);
          break;
        }
      }
    }
  }
  // Also check nested under parsed.data
  if (!rawTracks && parsed.data && typeof parsed.data === 'object') {
    for (const [k, v] of Object.entries(parsed.data)) {
      if (Array.isArray(v) && v.length) { rawTracks = v; break; }
    }
  }

  if (!rawTracks?.length) {
    console.error('[trending-audio] Parsed but no tracks. Keys seen:', Object.keys(parsed || {}));
    console.error('[trending-audio] Raw start:', raw.slice(0, 600));
    return [];
  }

  // Normalise field names — LLMs love renaming things
  return rawTracks.map(t => ({
    title: t.title || t.track_name || t.name || t.song || t.song_title || 'Untitled',
    artist: t.artist || t.creator || t.by || t.performer || 'unknown',
    vibe: t.vibe || t.mood || t.tone || t.description || '',
    bestFor: arr(t.bestFor || t.best_for || t.usage_context || t.use_cases || t.formats),
    videoStyleSuggestions: arr(t.videoStyleSuggestions || t.video_style_suggestions || t.video_ideas || t.style_ideas || t.suggestions),
    creatorArchetypes: arr(t.creatorArchetypes || t.creator_archetypes || t.creator_types || t.fits || t.audience),
    hookTiming: t.hookTiming || t.hook_timing || t.beat_drop || t.timing || '',
    sourceHint: t.sourceHint || t.source_hint || t.why_trending || t.description || t.reason || '',
  })).filter(t => t.title && t.title !== 'Untitled');
}

function arr(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean);
  if (typeof x === 'string') return x.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  return [];
}

// ── Dedupe ─────────────────────────────────────────

function dedupe(tracks) {
  const seen = new Map();
  for (const t of tracks) {
    if (!t.title || !t.artist) continue;
    const key = `${t.title.toLowerCase().trim()}|${t.artist.toLowerCase().trim()}`;
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()];
}

// ── Main public function ───────────────────────────

export async function refreshTrendingAudio(opts = {}) {
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const year = new Date().getFullYear();
  const queries = opts.queries || [
    // General listicles (seeds the widest pool)
    `TikTok creative center trending sounds ${month}`,
    `tokboard tokchart viral TikTok songs ${month}`,
    `Buffer HeyOrca trending TikTok audio list ${month}`,
    `viral TikTok sounds ${month} ${year} creators using right now`,
    `best TikTok songs going viral this week ${year}`,
    `top 50 TikTok sounds ${month}`,

    // Per-vibe queries — surface genre/mood-specific tracks the general lists miss
    `trending TikTok audio ambient moody aesthetic ${month}`,
    `trending TikTok sounds Gen-Z humour chaotic ${month}`,
    `trending TikTok audio nostalgic throwback ${year}`,
    `viral TikTok sounds upbeat hype workout ${month}`,
    `trending TikTok audio romantic soft POV ${month}`,
    `trending TikTok sounds storytime voiceover ${month}`,
    `viral TikTok audio sad emotional slow ${month}`,

    // Per-format queries — different content types use different sounds
    `trending TikTok audio transformation before after ${month}`,
    `viral TikTok sounds day in the life vlog ${month}`,
    `trending TikTok audio food recipe cooking ${month}`,
    `viral TikTok audio fitness workout gym ${month}`,
    `trending TikTok sounds B2B business creator ${month}`,
    `viral TikTok audio fashion OOTD outfit ${month}`,

    // Platform-specific discovery
    `TikTok audio trending on FYP this week ${month}`,
    `TikTok sounds going viral among micro-influencers ${year}`,
  ];

  console.log(`[trending-audio] Running ${queries.length} Exa searches for ${month}…`);

  const allArticles = [];
  for (const q of queries) {
    try {
      const res = await exaSearch(q, { numResults: 6, maxChars: 5000 });
      for (const r of (res.results || [])) {
        if (r.text && r.text.length > 200) {
          allArticles.push({ title: r.title, url: r.url, text: r.text });
        }
      }
    } catch (err) {
      console.log(`  [trending-audio] Exa "${q.slice(0, 40)}…" failed: ${err.message}`);
    }
  }

  if (!allArticles.length) throw new Error('Exa returned no usable articles');
  console.log(`[trending-audio] Got ${allArticles.length} articles across ${queries.length} queries`);

  // Dedupe by URL before LLM
  const seenUrls = new Set();
  const uniqueArticles = allArticles.filter(a => {
    if (seenUrls.has(a.url)) return false;
    seenUrls.add(a.url);
    return true;
  });

  const tracks = await structureArticles(uniqueArticles);
  const cleanTracks = dedupe(tracks);
  console.log(`[trending-audio] Extracted ${cleanTracks.length} unique tracks. Running per-track analysis…`);

  // Build a context blob from all articles to give the analysis step some flavour
  const fullContext = uniqueArticles.map(a => a.text || '').join('\n').slice(0, 5000);

  // Step 2: enrich each track with synthesised analysis — parallel in batches of 5
  const limit = Math.min(cleanTracks.length, 40);
  const toEnrich = cleanTracks.slice(0, limit);
  const BATCH_SIZE = 5;
  const enriched = [];

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (t) => {
      // Run analysis + link resolution in parallel for each track
      const needsAnalysis = !(t.vibe && t.bestFor.length && t.videoStyleSuggestions.length);
      const [analysis, links] = await Promise.all([
        needsAnalysis ? analyseTrack(t.title, t.artist, fullContext) : Promise.resolve(null),
        resolveSongLinks(t.title, t.artist),
      ]);
      return {
        ...t,
        ...(analysis || {}),
        links,
      };
    }));
    enriched.push(...results);
    const linkCount = enriched.filter(t => t.links && (t.links.tiktok || t.links.spotify || t.links.youtube)).length;
    console.log(`  [trending-audio] Enriched batch ${i / BATCH_SIZE + 1} (${enriched.length}/${toEnrich.length} · ${linkCount} with links)`);
  }

  console.log(`[trending-audio] Done — ${enriched.length} tracks enriched`);

  const payload = {
    refreshedAt: new Date().toISOString(),
    month,
    sourceCount: uniqueArticles.length,
    trackCount: enriched.length,
    sources: uniqueArticles.slice(0, 10).map(a => ({ title: a.title, url: a.url })),
    tracks: enriched,
  };

  // Ensure data dir exists
  if (!existsSync(dirname(DATA_FILE))) mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

// ── Read-only ──────────────────────────────────────

export function getTrendingAudio() {
  if (!existsSync(DATA_FILE)) return null;
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf-8')); }
  catch { return null; }
}

/**
 * Filter tracks to ones that match a given client's brand archetype or niche.
 * Simple keyword overlap for now.
 */
export function filterForClient(tracks, client) {
  if (!client) return tracks;
  const haystacks = [
    client.niche || '',
    client.name || '',
    client.brandArchetype || '',
    ...(client.contentPillars || []),
  ].join(' ').toLowerCase();

  return tracks
    .map(t => {
      const fields = [
        ...(t.creatorArchetypes || []),
        ...(t.bestFor || []),
        t.vibe || '',
      ].join(' ').toLowerCase();

      const words = fields.split(/[^a-z]+/).filter(w => w.length > 3);
      const score = words.filter(w => haystacks.includes(w)).length;
      return { ...t, relevanceScore: score };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
