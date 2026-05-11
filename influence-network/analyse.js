/**
 * Influence Network — surfaces who a client interacts with / learns from.
 *
 * Signals (all from existing scraped data — no new scraping needed):
 *   1. @mentions in THEIR captions    → collaborators, aspirational references
 *   2. Hashtags they use              → which community they belong to
 *   3. Commenters on their posts      → engaged audience; some are peers/fans
 *   4. Co-mentioned creators          → their content orbit
 *
 * Plus an LLM pass that reads all signals + infers:
 *   - Likely thought leaders in their niche
 *   - Collaboration opportunities
 *   - Community position
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

// ── Signal extraction ──────────────────────────────

const MENTION_RE = /@([a-zA-Z0-9._]{2,30})/g;
const HASHTAG_RE = /#([a-zA-Z0-9_]{2,50})/g;

function tally(arr) {
  const map = new Map();
  for (const v of arr) {
    const k = v.toLowerCase();
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function extractFromCaptions(posts) {
  const allMentions = [];
  const allHashtags = [];
  const perPostMentions = [];

  for (const p of posts) {
    const caption = p.caption || '';
    const mentions = [...caption.matchAll(MENTION_RE)].map(m => m[1]);
    const hashtags = [...caption.matchAll(HASHTAG_RE)].map(m => m[1]);
    allMentions.push(...mentions);
    allHashtags.push(...hashtags);
    perPostMentions.push(mentions);
  }

  // Co-mention detection — which accounts appear together in the same posts
  const coMentions = new Map();
  for (const set of perPostMentions) {
    for (let i = 0; i < set.length; i++) {
      for (let j = i + 1; j < set.length; j++) {
        const [a, b] = [set[i].toLowerCase(), set[j].toLowerCase()].sort();
        const k = `${a}|${b}`;
        coMentions.set(k, (coMentions.get(k) || 0) + 1);
      }
    }
  }

  return {
    mentions: tally(allMentions),
    hashtags: tally(allHashtags),
    coMentions: [...coMentions.entries()]
      .map(([k, count]) => ({ pair: k.split('|'), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

function extractCommenters(commentIntel) {
  if (!commentIntel) return [];
  const all = [];
  for (const bucket of ['topQuestions', 'fanRequests', 'hateComments']) {
    for (const item of (commentIntel[bucket] || [])) {
      if (item.author) all.push(item.author);
    }
  }
  return tally(all);
}

// ── Public: compute network for a client ──────────

export async function computeInfluenceNetwork(clientId, opts = {}) {
  const postsFile = join(DATA_DIR, clientId, 'posts-latest.json');
  const posts = readJson(postsFile);
  if (!posts) throw new Error('No posts-latest.json — run scraper first');

  const commentIntel = readJson(join(DATA_DIR, clientId, 'comment-intel.json'));

  // Flatten posts
  const allPosts = [];
  const platforms = posts.platforms || posts;
  for (const [plat, list] of Object.entries(platforms)) {
    const arr = Array.isArray(list) ? list : (list?.posts || []);
    for (const p of arr) allPosts.push({ ...p, _platform: plat });
  }

  const extracted = extractFromCaptions(allPosts);
  const commenters = extractCommenters(commentIntel);

  // Normalise top lists — cap for readability
  const topMentions = extracted.mentions.slice(0, 20);
  const topHashtags = extracted.hashtags.slice(0, 20);
  const topCommenters = commenters.slice(0, 15);

  const rawSignals = {
    topMentions,
    topHashtags,
    topCommenters,
    coMentions: extracted.coMentions,
    postCountAnalysed: allPosts.length,
  };

  // LLM analysis — only if we have any meaningful signal
  const hasSignal = topMentions.length >= 2 || topCommenters.length >= 3 || topHashtags.length >= 3;
  let insight = null;
  if (hasSignal && !opts.skipLLM) {
    try {
      insight = await llmInfluenceRead(clientId, rawSignals);
    } catch (err) {
      console.log(`[influence] LLM analysis failed: ${err.message}`);
    }
  }

  const payload = {
    clientId,
    generatedAt: new Date().toISOString(),
    postCountAnalysed: allPosts.length,
    signals: rawSignals,
    insight,
  };

  const dir = join(DATA_DIR, clientId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'influence-network.json'), JSON.stringify(payload, null, 2));
  return payload;
}

// ── LLM synthesis ──────────────────────────────────

async function llmInfluenceRead(clientId, signals) {
  const { topMentions, topHashtags, topCommenters, coMentions } = signals;

  const clientsFile = join(ROOT, 'clients.json');
  const all = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = all.find(c => c.id === clientId);
  const niche = client?.niche || '';
  const geography = client?.geography || '';

  const prompt = `You are analysing a creator's "influence network" — who they reference, collaborate with, and orbit in their content.

CLIENT: ${client?.name}
Niche: ${niche}
Geography: ${geography}

RAW SIGNALS (extracted from their recent posts + comments):

Top @mentions in their captions (collaborators, references):
${topMentions.slice(0, 12).map(m => `  @${m.name} (${m.count}×)`).join('\n') || '  (none)'}

Top hashtags they use (community signal):
${topHashtags.slice(0, 10).map(h => `  #${h.name} (${h.count}×)`).join('\n') || '  (none)'}

Top commenters on their posts (engaged audience / peers):
${topCommenters.slice(0, 10).map(c => `  @${c.name} (${c.count}×)`).join('\n') || '  (none)'}

Co-mentioned creators (appear together in same post, indicating tight orbit):
${coMentions.slice(0, 6).map(c => `  @${c.pair[0]} + @${c.pair[1]} (${c.count}×)`).join('\n') || '  (none)'}

Produce a JSON analysis with these exact keys:
{
  "orbit": [
    {
      "name": "account handle or real name",
      "role": "collaborator | thought-leader | peer | fan-leader | brand-sponsor | unclear",
      "signal": "one-line explanation — why they show up in this client's orbit",
      "actionable": "one specific move — e.g. 'request guest collab' or 'tag them in next reel on X'"
    }
  ],
  "communitySignal": "1-2 sentences: which sub-community the client is in (based on hashtags + mentions), and what that tells us about their audience",
  "likelyThoughtLeaders": ["account", "account", "account"],
  "collabOpportunities": ["specific creator → specific angle", "..."],
  "blindSpots": "1 sentence: creators or niches this client is NOT engaging with that they probably should, given their content"
}

Rules:
- "orbit" should have 6-10 entries — the most significant accounts across all signals
- If a handle shows up in multiple signal lists, flag that in "signal"
- If someone is clearly a bigger account (likely the client following them), label role as "thought-leader"
- If the data is thin, return fewer orbit entries rather than padding
- British English. No generic platitudes.

Return ONLY valid JSON. No prose, no code fences.`;

  const raw = await callLLM(prompt, 'influence-network', {
    maxTokens: 3000,
    tier: 'premium',
    model: process.env.INFLUENCE_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const s = cleaned.search(/[{\[]/);
  if (s > 0) cleaned = cleaned.slice(s);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[influence] JSON parse failed:', err.message);
    return null;
  }
}

// ── Read-only ──────────────────────────────────────

export function getInfluenceNetwork(clientId) {
  const f = join(DATA_DIR, clientId, 'influence-network.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf-8')); }
  catch { return null; }
}
