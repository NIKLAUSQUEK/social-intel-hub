/**
 * Trending edit styles + sound effects (FAH, bass drops, etc.)
 *
 * Different from trending-audio:
 *   - Not music tracks, but EDITING techniques + NON-MUSIC audio clips
 *   - Examples: "FAH" inhale SFX, invisible transitions, zoom-punch-in,
 *     speed-ramps, freeze-frame reveal, record-scratch, text-pop dings
 *   - Data is more enduring (techniques last longer than music trends)
 *
 * Data sources: Exa scrapes Buffer, CapCut blog, HeyOrca, Descript guides,
 * Daniel Schiffer / Peter McKinnon style articles, TikTok editor listicles.
 *
 * Output shape per entry:
 *   {
 *     type: 'edit' | 'sfx',
 *     name: "FAH sound effect" or "Speed ramp",
 *     category: "transition" | "reveal" | "punctuation" | "pacing" | "text-overlay" | "audio-accent" | "hook",
 *     description: concise one-liner,
 *     vibe: mood descriptors,
 *     whenToUse: [list of moments this lands],
 *     exampleSetup: concrete shot/edit instructions,
 *     pairsWellWith: [other techniques or audio types it layers with],
 *     toolsNeeded: ["CapCut", "Premiere", "native TikTok editor"],
 *     difficulty: "easy" | "moderate" | "advanced",
 *     creatorArchetypes: [...],
 *     sourceHint: why it's trending
 *   }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';
import { allSeeds } from './seeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_FILE = join(__dirname, '..', 'data', '_trending-techniques-latest.json');

// ── Exa ────────────────────────────────────────────

async function exaSearch(query, opts = {}) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set');
  const body = {
    query,
    type: opts.type || 'auto',
    numResults: opts.numResults || 6,
    contents: { text: { maxCharacters: opts.maxChars || 5000 } },
  };
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  return res.json();
}

// ── SFX link resolver (TikTok sound page, YouTube sample) ──

async function resolveSFXLinks(name) {
  const links = { tiktok: '', youtube: '' };
  const clean = name.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const probes = [
    { key: 'tiktok',  q: `"${clean}" sound effect site:tiktok.com/music OR site:tiktok.com/discover` },
    { key: 'youtube', q: `"${clean}" sound effect site:youtube.com/watch OR site:youtube.com/shorts` },
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
        if (key === 'youtube' && /youtube\.com\/(watch|shorts)/i.test(url)) {
          links.youtube = url.split('&')[0];
          break;
        }
      }
    } catch { /* best effort */ }
  }
  return links;
}

// ── Edit-style link resolver (tutorial + example clip) ──

async function resolveEditLinks(name, category) {
  const links = { tutorial: '', example: '', tiktok: '' };
  const clean = name.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const probes = [
    // Tutorial: how to do this in CapCut/Premiere — usually long-form YouTube
    { key: 'tutorial', q: `"${clean}" CapCut tutorial how to site:youtube.com/watch` },
    // Example: short visual showing the technique in action
    { key: 'example',  q: `"${clean}" example site:youtube.com/shorts OR site:youtube.com/watch` },
    // TikTok hashtag/discover page if it exists
    { key: 'tiktok',   q: `"${clean}" transition technique site:tiktok.com/discover OR site:tiktok.com/tag` },
  ];

  for (const { key, q } of probes) {
    try {
      const res = await exaSearch(q, { numResults: 4, maxChars: 200 });
      for (const r of (res.results || [])) {
        const url = r.url || '';
        if (key === 'tutorial' && /youtube\.com\/watch/i.test(url) && !links.tutorial) {
          links.tutorial = url.split('&')[0];
          break;
        }
        if (key === 'example' && /youtube\.com\/(watch|shorts)/i.test(url) && !links.example && url !== links.tutorial) {
          links.example = url.split('&')[0];
          break;
        }
        if (key === 'tiktok' && /tiktok\.com\/(tag|discover)/i.test(url)) {
          links.tiktok = url.split('?')[0];
          break;
        }
      }
    } catch { /* best effort */ }
  }
  return links;
}

// ── LLM structuring ────────────────────────────────

const SYSTEM_PROMPT = `You are a TikTok editor content strategist. Extract trending EDIT STYLES and SOUND EFFECTS from the source articles.

DO include:
- Edit techniques: transitions (whip pan, invisible, match cut), pacing moves (speed ramp, freeze frame, jump cut stack), reveal mechanics, text overlay styles, color treatments
- Sound effects: short non-music clips used as punctuation — the "FAH" inhale, record scratches, bass drops, text-pop dings, notification sounds, anime-subway, "Oh my God becky", phone typing sfx, magic chime, etc.

Do NOT include:
- Music tracks or full songs (those belong in the music feed)

For EACH trending technique/SFX, produce this structure (root key MUST be "techniques"):

{
  "techniques": [
    {
      "type": "edit" | "sfx",
      "name": "Short name — e.g. 'FAH sound effect' or 'Invisible transition'",
      "category": "transition | reveal | punctuation | pacing | text-overlay | audio-accent | hook | color",
      "description": "One-line explanation of what it does (max 18 words)",
      "vibe": "2-3 mood descriptors, e.g. 'chaotic · gen-Z humour' or 'dramatic · impactful'",
      "whenToUse": ["moment 1 — e.g. 'opening hook, before beat drop'", "moment 2", "moment 3"],
      "exampleSetup": "Concrete shot/edit instruction a creator can copy (2-3 sentences, specific)",
      "pairsWellWith": ["other technique names this layers with"],
      "toolsNeeded": ["CapCut", "Premiere", "native TikTok editor", "DaVinci"],
      "difficulty": "easy | moderate | advanced",
      "creatorArchetypes": ["fitness", "B2B", "lifestyle", "comedy", "educator"],
      "sourceHint": "One sentence on why it's trending right now"
    }
  ]
}

Aim for 15-25 entries with a MIX: at least 40% SFX entries (not just edit techniques). If the articles are AI-editing-heavy, still dig for any SFX mentions (named sounds, meme audio, trending soundbites). Be thorough — skim every article.

If the source articles don't explicitly name enough SFX, you may include well-known TikTok SFX from your training knowledge that are STILL relevant — mark those with sourceHint "known viral SFX — evergreen". Examples you CAN include from knowledge: FAH inhale, Vine Boom, Oh My God Becky, text-pop, anime subway, record scratch, bass drop, run it up — these are staples creators still reference.

Return ONLY the JSON. No prose, no code fences.`;

async function structureArticles(articles) {
  const blob = articles
    .slice(0, 12)
    .map((a, i) => `### Article ${i + 1}: ${a.title}\nURL: ${a.url}\n${(a.text || '').slice(0, 3500)}`)
    .join('\n\n');

  const user = `Extract trending edit styles + sound effects from these articles. Return the JSON structure described.\n\n${blob}`;

  const raw = await callLLM(user, 'techniques-structure', {
    maxTokens: 6000,
    tier: 'premium',
    model: process.env.TECHNIQUES_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.search(/[{\[]/);
  if (start > 0) cleaned = cleaned.slice(start);

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (err) {
    console.error('[tech-structure] JSON parse failed:', err.message);
    return [];
  }

  // Fuzzy root-key detection — accept any array of objects with SOME identifier field
  let rawList = Array.isArray(parsed) ? parsed : null;
  if (!rawList && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        const sample = v[0];
        if (sample.name || sample.title || sample.technique_name || sample.technique || sample.effect_name || sample.sfx || sample.id) {
          rawList = v;
          console.log(`  [tech] Using key "${k}" (${v.length} items) — sample keys: ${Object.keys(sample).slice(0,5).join(',')}`);
          break;
        }
      }
    }
  }
  if (!rawList) {
    console.error('[tech-structure] No parseable list. Root keys:', Object.keys(parsed || {}));
    console.error('[tech-structure] Raw start:', raw.slice(0, 600));
    return [];
  }

  return rawList.map(t => {
    const name = t.name || t.title || t.technique_name || t.technique || t.effect_name || t.sfx || t.id || '';
    if (!name) return null;
    return {
      type: (t.type || t.category_type || inferType(name + ' ' + (t.description || ''))).toLowerCase(),
      name,
      category: t.category || t.subcategory || inferCategory(name),
      description: t.description || t.desc || t.summary || t.what_it_does || '',
      vibe: t.vibe || t.mood || t.tone || t.feel || '',
      whenToUse: arr(t.whenToUse || t.when_to_use || t.bestFor || t.best_for || t.use_cases || t.usage || t.good_for),
      exampleSetup: t.exampleSetup || t.example_setup || t.example || t.howTo || t.how_to || t.how_to_use || t.steps || '',
      pairsWellWith: arr(t.pairsWellWith || t.pairs_well_with || t.combinesWith || t.pairs_with || t.combines),
      toolsNeeded: arr(t.toolsNeeded || t.tools_needed || t.tools || t.app || t.apps),
      difficulty: (t.difficulty || t.skill_level || t.level || 'moderate').toLowerCase(),
      creatorArchetypes: arr(t.creatorArchetypes || t.creator_archetypes || t.creator_types || t.fits || t.audience),
      sourceHint: t.sourceHint || t.source_hint || t.why_trending || t.reason || t.context || '',
    };
  }).filter(Boolean);
}

function arr(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean);
  if (typeof x === 'string') return x.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  return [];
}

function inferType(name) {
  const n = name.toLowerCase();
  if (/sound|sfx|effect|inhale|scratch|drop|ding|fah|boom|whoosh|chime|pop/.test(n)) return 'sfx';
  return 'edit';
}

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/transition|pan|swipe|cut/.test(n)) return 'transition';
  if (/zoom|reveal|flash/.test(n)) return 'reveal';
  if (/sound|sfx|drop|inhale|ding|pop/.test(n)) return 'audio-accent';
  if (/speed|slow|fast|ramp/.test(n)) return 'pacing';
  if (/text|caption|typography/.test(n)) return 'text-overlay';
  if (/color|grade|filter|lut/.test(n)) return 'color';
  return 'hook';
}

// ── Dedupe ─────────────────────────────────────────

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const key = (t.name || '').toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// ── Public ─────────────────────────────────────────

export async function refreshTrendingTechniques() {
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const year = new Date().getFullYear();

  const queries = [
    // Edit-style queries
    `trending TikTok edit styles ${month}`,
    `viral TikTok editing techniques ${year}`,
    `CapCut trending effects edit tutorial ${month}`,
    `TikTok video transitions list ${year}`,
    `Daniel Schiffer style TikTok editing`,
    `viral jump cut invisible transition ${year}`,
    `TikTok reveal effect zoom punch in`,
    `CapCut trending presets ${month}`,

    // Sound-effect (non-music) queries — target explicit SFX names
    `TikTok FAH sound effect inhale viral what is`,
    `TikTok viral sound effect list names 2025 2026`,
    `TikTok SFX meme sounds record scratch bass boom`,
    `popular TikTok sound effects list how to use`,
    `TikTok trending soundbites not music viral clips`,
    `oh my god becky vine boom SFX TikTok`,
    `TikTok text pop ding chime notification SFX`,
    `TikTok anime subway run it up SFX viral`,

    // Creator-tutorial queries (usually list both edits + SFX)
    `best TikTok editing tips tricks ${year}`,
    `TikTok Creator Academy editing best practices`,
  ];

  console.log(`[tech] Running ${queries.length} queries for ${month}…`);

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
      console.log(`  [tech] Exa "${q.slice(0, 40)}..." failed: ${err.message}`);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const unique = articles.filter(a => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  console.log(`[tech] Got ${unique.length} unique articles from ${queries.length} queries`);

  const extracted = await structureArticles(unique);
  console.log(`[tech] Extracted ${extracted.length} from articles`);

  // Merge: curated seeds + Exa-discovered. Seeds first so they take priority on dedupe collisions.
  const seeds = allSeeds().map(s => ({ ...s, fromSeed: true }));
  const techniques = dedupe([...seeds, ...extracted]);
  console.log(`[tech] Merged ${seeds.length} seeds + ${extracted.length} extracted → ${techniques.length} unique`);

  // Resolve links for ALL techniques in parallel batches of 4
  // — SFX get tiktok/youtube sound links
  // — Edits get tutorial + example + tiktok-discover links
  console.log(`[tech] Resolving visual links for ${techniques.length} techniques...`);
  const LINK_BATCH = 4;
  for (let i = 0; i < techniques.length; i += LINK_BATCH) {
    const batch = techniques.slice(i, i + LINK_BATCH);
    await Promise.all(batch.map(async (t) => {
      t.links = t.type === 'sfx'
        ? await resolveSFXLinks(t.name)
        : await resolveEditLinks(t.name, t.category);
    }));
  }
  const sfxLinked  = techniques.filter(t => t.type === 'sfx'  && t.links && (t.links.tiktok || t.links.youtube)).length;
  const editLinked = techniques.filter(t => t.type === 'edit' && t.links && (t.links.tutorial || t.links.example)).length;
  console.log(`[tech] Links — SFX ${sfxLinked}/${techniques.filter(t=>t.type==='sfx').length}, Edits ${editLinked}/${techniques.filter(t=>t.type==='edit').length}`);

  // Backfill missing exampleSetup — per-technique Sonnet call
  const needsSetup = techniques.filter(t => !t.exampleSetup || t.exampleSetup.length < 20);
  if (needsSetup.length) {
    console.log(`[tech] Backfilling exampleSetup for ${needsSetup.length} techniques...`);
    for (const t of needsSetup) {
      try {
        const prompt = `Technique: "${t.name}" (${t.type})
Description: ${t.description || 'trending ' + t.type}

Write ONE concise instruction (2-3 sentences max) for a creator on exactly HOW to do this. Be specific about shots, timing, or editor steps. No preamble.`;
        const raw = await callLLM(prompt, 'setup-backfill', {
          maxTokens: 150,
          tier: 'premium',
          model: 'claude-sonnet-4-20250514',
        });
        t.exampleSetup = raw.trim().replace(/^["']|["']$/g, '');
      } catch { /* keep empty */ }
    }
  }

  const payload = {
    refreshedAt: new Date().toISOString(),
    month,
    sourceCount: unique.length,
    count: techniques.length,
    editCount: techniques.filter(t => t.type === 'edit').length,
    sfxCount:  techniques.filter(t => t.type === 'sfx').length,
    sources: unique.slice(0, 12).map(a => ({ title: a.title, url: a.url })),
    techniques,
  };

  if (!existsSync(dirname(DATA_FILE))) mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

export function getTrendingTechniques() {
  if (!existsSync(DATA_FILE)) return null;
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf-8')); }
  catch { return null; }
}
