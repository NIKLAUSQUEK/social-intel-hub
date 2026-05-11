/**
 * Content Performance Analyser
 *
 * Surfaces:
 *   1. Top-performing posts (by views + engagement rate composite)
 *   2. Top topics — LLM-clusters captions into themes, ranks by avg performance
 *   3. "Double down" recommendations — themes/formats with best ROI per post
 *   4. Underperformer warnings — themes that consistently flop
 *
 * Uses existing scraped data only (no extra LLM cost beyond clustering pass).
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
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

function performanceScore(p, followers) {
  const v = p.views || 0;
  const l = p.likes || 0;
  const c = p.comments || 0;
  const sh = p.shares || 0;
  const sa = p.saves || 0;
  const interactions = l + c + sh + sa;
  // Engagement rate (interactions / max(views, followers))
  const denom = v > 0 ? v : (followers || 1);
  const engagementRate = interactions / denom;
  // Composite: scale views + boost by ER
  const viewScore = Math.log10(v + 1);
  return {
    rawViews: v,
    rawInteractions: interactions,
    engagementRate,
    composite: viewScore * (1 + engagementRate * 5), // ER acts as a multiplier
  };
}

function flattenPosts(posts) {
  if (!posts) return [];
  const platforms = posts.platforms || posts;
  const all = [];
  for (const [plat, list] of Object.entries(platforms)) {
    const arr = Array.isArray(list) ? list : (list?.posts || []);
    for (const p of arr) {
      if (!p.caption && !p.url) continue;
      all.push({ ...p, _platform: plat });
    }
  }
  return all;
}

// ── Public ─────────────────────────────────────────

export async function computePerformance(clientId, opts = {}) {
  const posts = readJson(join(DATA_DIR, clientId, 'posts-latest.json'));
  const metrics = readJson(join(DATA_DIR, clientId, 'metrics-latest.json'));
  if (!posts) throw new Error('No posts data — run scraper first');

  const flat = flattenPosts(posts);
  if (!flat.length) throw new Error('No posts found in scraped data');

  // Score each post
  const scored = flat.map(p => {
    const followers = metrics?.platforms?.[p._platform]?.followers || 0;
    return { ...p, score: performanceScore(p, followers) };
  });

  // Sort by composite
  scored.sort((a, b) => b.score.composite - a.score.composite);

  // Top 10 + Bottom 5
  const topPosts = scored.slice(0, 10).map(p => ({
    url: p.url,
    platform: p._platform,
    format: p.postType || p.type,
    date: p.date,
    caption: (p.caption || '').slice(0, 200),
    views: p.score.rawViews,
    interactions: p.score.rawInteractions,
    engagementRate: Number((p.score.engagementRate * 100).toFixed(2)),
    compositeScore: Number(p.score.composite.toFixed(2)),
  }));

  const bottomPosts = scored.slice(-5).reverse().map(p => ({
    url: p.url,
    platform: p._platform,
    caption: (p.caption || '').slice(0, 150),
    views: p.score.rawViews,
    engagementRate: Number((p.score.engagementRate * 100).toFixed(2)),
  }));

  // Topic clustering via LLM
  let topics = null;
  if (!opts.skipLLM) {
    try {
      topics = await clusterTopics(scored, clientId);
    } catch (err) {
      console.log('[content-perf] topic clustering failed:', err.message);
    }
  }

  // Format breakdown (no LLM, pure stats)
  const byFormat = {};
  for (const p of scored) {
    const fmt = p.postType || p.type || 'unknown';
    if (!byFormat[fmt]) byFormat[fmt] = { count: 0, totalViews: 0, totalInteractions: 0, totalER: 0 };
    byFormat[fmt].count++;
    byFormat[fmt].totalViews += p.score.rawViews;
    byFormat[fmt].totalInteractions += p.score.rawInteractions;
    byFormat[fmt].totalER += p.score.engagementRate;
  }
  const formatRanked = Object.entries(byFormat).map(([format, s]) => ({
    format,
    count: s.count,
    avgViews: Math.round(s.totalViews / s.count),
    avgInteractions: Math.round(s.totalInteractions / s.count),
    avgER: Number((s.totalER / s.count * 100).toFixed(2)),
  })).sort((a, b) => b.avgViews - a.avgViews);

  // Per-platform breakdown
  const byPlatform = {};
  for (const p of scored) {
    const plat = p._platform;
    if (!byPlatform[plat]) byPlatform[plat] = { count: 0, totalViews: 0, totalInteractions: 0 };
    byPlatform[plat].count++;
    byPlatform[plat].totalViews += p.score.rawViews;
    byPlatform[plat].totalInteractions += p.score.rawInteractions;
  }

  const payload = {
    clientId,
    generatedAt: new Date().toISOString(),
    totalPosts: scored.length,
    topPosts,
    bottomPosts,
    formatRanked,
    byPlatform,
    topics,
  };

  const dir = join(DATA_DIR, clientId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'content-performance.json'), JSON.stringify(payload, null, 2));
  return payload;
}

async function clusterTopics(scored, clientId) {
  const clientsFile = join(ROOT, 'clients.json');
  const all = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = all.find(c => c.id === clientId);

  // Build compact post sample with score
  const sample = scored.slice(0, 80).map((p, i) => ({
    idx: i,
    plat: p._platform,
    format: p.postType || p.type,
    views: p.score.rawViews,
    er: Number((p.score.engagementRate * 100).toFixed(1)),
    caption: (p.caption || '').slice(0, 200).replace(/\n/g, ' '),
  }));

  const prompt = `You are a content strategist analysing what's actually working for a creator.

CREATOR: ${client?.name}
Niche: ${client?.niche || 'not specified'}
Geography: ${client?.geography || 'global'}

POSTS (${sample.length} ranked by composite performance, idx 0 = best):
${sample.map(p => `[${p.idx}] ${p.plat}/${p.format} · ${p.views.toLocaleString()} views · ${p.er}% ER · "${p.caption}"`).join('\n')}

Cluster these posts into 5-8 TOPICS. For each topic, return:
- A short topic name (3-6 words)
- Number of posts in topic
- Average views + ER for the topic
- Top 2 performing post indices in this topic
- A "double-down" recommendation if this topic is winning, or "diversify away" if it's draining
- Specific next-content ideas tied to what won

Return ONLY this JSON:
{
  "topics": [
    {
      "name": "Topic name",
      "postCount": 5,
      "avgViews": 3200,
      "avgER": 4.2,
      "topPostIndices": [0, 4],
      "verdict": "double-down | maintain | diversify-away | experimental",
      "rationale": "Why this verdict — reference specific numbers/posts",
      "nextIdeas": ["idea 1 tied to what won", "idea 2", "idea 3"]
    }
  ],
  "headlineInsight": "1-2 sentences: the single most important pattern in the data — what to do MORE of, what to STOP doing"
}

Rules:
- Be brutally specific. No "post more engaging content" — say WHICH topic and HOW.
- Connect verdicts to actual numbers from the data.
- British English.`;

  const raw = await callLLM(prompt, 'content-perf-topics', {
    maxTokens: 4000,
    tier: 'premium',
    model: process.env.CONTENT_PERF_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const s = cleaned.search(/[{\[]/);
  if (s > 0) cleaned = cleaned.slice(s);
  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    console.error('[content-perf] parse failed:', err.message);
    return null;
  }
}

export function getPerformance(clientId) {
  const f = join(DATA_DIR, clientId, 'content-performance.json');
  return readJson(f);
}
