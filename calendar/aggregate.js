/**
 * Calendar data aggregator
 *
 * Assembles a unified view per client by merging:
 *   1. Past published posts (from scraper/posts-latest.json) — with dates + performance
 *   2. AI-generated plan (from content-calendar.json, if generated)
 *   3. Brand-report content_calendar_seeds (4-week strategic themes)
 *   4. Comment-intel contentIdeas (audience-driven topics)
 *   5. Classifications (from intelligence module — TOF/MOF/BOF guessing)
 *
 * Returns a normalized timeline suitable for rendering as a calendar grid.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

// ── Funnel inference ───────────────────────────────

// Lightweight heuristic: when no AI classification exists, infer funnel from
// content_type + caption keywords. Not perfect; LLM classifier (intelligence
// module) will override when present.
function inferFunnel(post, classification) {
  if (classification?.funnel) return classification.funnel;

  const cta = (classification?.cta_type || '').toLowerCase();
  const type = (classification?.content_type || post.postType || '').toLowerCase();
  const caption = (post.caption || '').toLowerCase();

  // BOF signals
  if (cta === 'hard' || /\b(book|buy|sign up|register|apply|dm me|link in bio|sale|offer ends|limited)\b/.test(caption)) {
    return 'BOF';
  }
  // MOF signals
  if (/(educational|tutorial|case study|guide|breakdown|framework)/.test(type)) {
    return 'MOF';
  }
  if (/\b(how to|step \d|the \d\s+\w+|case study|proof|results|data)\b/.test(caption)) {
    return 'MOF';
  }
  // Default to TOF (awareness / entertainment / reaction)
  return 'TOF';
}

function platformFromUrl(url) {
  if (!url) return 'unknown';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('facebook.com')) return 'facebook';
  return 'unknown';
}

function parseDateToIso(val) {
  if (!val) return null;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

// ── Past posts: flatten + enrich ───────────────────

function loadPastPosts(clientId) {
  const postsFile = join(DATA_DIR, clientId, 'posts-latest.json');
  const raw = readJson(postsFile);
  if (!raw) return [];

  const platforms = raw.platforms || raw;
  const all = [];

  for (const plat of ['instagram', 'tiktok', 'linkedin', 'facebook']) {
    const list = Array.isArray(platforms[plat]) ? platforms[plat] : (platforms[plat]?.posts || []);
    for (const p of list) {
      const iso = parseDateToIso(p.date || p.timestamp || p.publishedAt);
      all.push({
        id: p.url || p.postId || Math.random().toString(36),
        type: 'past',
        platform: plat,
        date: iso,
        caption: p.caption || '',
        url: p.url || '',
        format: p.postType || p.type || '',
        metrics: {
          views: p.views ?? null,
          likes: p.likes ?? null,
          comments: p.comments ?? null,
        },
        performance: performanceScore(p),
      });
    }
  }

  return all;
}

function performanceScore(post) {
  const v = post.views || 0;
  const l = post.likes || 0;
  const c = post.comments || 0;
  const raw = v + l * 5 + c * 10;
  // Simple bucket: low < 500, mid < 5000, high >= 5000
  if (raw >= 5000) return 'high';
  if (raw >= 500) return 'mid';
  return 'low';
}

// ── Classifications (from intelligence module) ─────

function loadClassifications(clientId) {
  // Check both possible locations
  const paths = [
    join(DATA_DIR, clientId, 'classifications.json'),
    join(DATA_DIR, clientId, 'intelligence', 'classifications.json'),
  ];
  for (const p of paths) {
    const data = readJson(p);
    if (data) return Array.isArray(data) ? data : (data.classifications || []);
  }
  return [];
}

// ── Brand report calendar seeds ────────────────────

function loadBrandSeeds(clientId) {
  const report = readJson(join(DATA_DIR, clientId, 'brand-report-latest.json'));
  if (!report?.structured?.content_calendar_seeds) return [];

  // Normalize to plan-item shape; no fixed date (brand seeds are relative weeks)
  const weeks = report.structured.content_calendar_seeds;
  const items = [];
  for (const w of weeks) {
    for (const post of (w.posts || [])) {
      items.push({
        id: `seed-w${w.week}-${post.day}`,
        type: 'seed',
        source: 'brand-report',
        platform: inferPlatformFromFormat(post.format),
        week: w.week,
        day: post.day,                // "Mon" / "Wed" / "Fri"
        theme: w.theme,
        topic: post.topic,
        format: post.format,
        hook: post.hook,
        funnel: null,                  // seed items don't carry funnel yet — AI plan fills this
      });
    }
  }
  return items;
}

function inferPlatformFromFormat(format) {
  if (!format) return 'instagram';
  const f = format.toLowerCase();
  if (/tiktok/.test(f)) return 'tiktok';
  if (/linkedin|carousel|post/.test(f)) return 'linkedin';
  if (/reel|story/.test(f)) return 'instagram';
  return 'instagram';
}

// ── Comment-intel content ideas ────────────────────

function loadCommentIdeas(clientId) {
  const intel = readJson(join(DATA_DIR, clientId, 'comment-intel.json'));
  if (!intel?.contentIdeas?.length) return [];

  return intel.contentIdeas.map((idea, i) => ({
    id: `idea-${i}`,
    type: 'idea',
    source: 'audience',
    platform: inferPlatformFromFormat(idea.format),
    topic: idea.topic || idea.title,
    title: idea.title,
    format: idea.format,
    hook: idea.hook,
    funnel: idea.type === 'hate_comment_response' ? 'TOF' : 'MOF', // heuristic
    commentCount: idea.commentCount,
    sentiment: idea.sentiment,
    whyItWorks: idea.whyItWorks,
    intentType: idea.type, // fan_request | hate_comment_response | faq | controversy
  }));
}

// ── Generated plan (output of calendar/generate.js) ─

function loadGeneratedPlan(clientId) {
  return readJson(join(DATA_DIR, clientId, 'content-calendar.json'));
}

// ── Public: assemble calendar view ─────────────────

export function buildCalendarView(clientId, opts = {}) {
  const platform = opts.platform || null; // filter: 'instagram' | 'tiktok' | 'linkedin' | 'facebook'

  const pastPosts = loadPastPosts(clientId);
  const classifications = loadClassifications(clientId);
  const seeds = loadBrandSeeds(clientId);
  const ideas = loadCommentIdeas(clientId);
  const plan = loadGeneratedPlan(clientId);

  // Enrich past posts with classification + inferred funnel
  const classByUrl = {};
  for (const c of classifications) classByUrl[c.post_id || c.url] = c;

  for (const p of pastPosts) {
    const cls = classByUrl[p.url] || null;
    p.contentType = cls?.content_type || null;
    p.hookType = cls?.hook_type || null;
    p.funnel = inferFunnel(p, cls);
  }

  // Apply platform filter if set
  const filter = (arr) => platform ? arr.filter(x => x.platform === platform) : arr;

  return {
    clientId,
    platform,
    past: filter(pastPosts).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    plannedPlan: plan ? filter(plan.items || []) : [],
    brandSeeds: filter(seeds),
    audienceIdeas: filter(ideas),
    summary: buildSummary(pastPosts, platform),
    hasGeneratedPlan: !!plan,
    lastGenerated: plan?.generatedAt || null,
  };
}

function buildSummary(pastPosts, platformFilter) {
  const filtered = platformFilter ? pastPosts.filter(p => p.platform === platformFilter) : pastPosts;
  const byFunnel = { TOF: 0, MOF: 0, BOF: 0 };
  const byPlatform = {};
  const byFormat = {};
  let high = 0, mid = 0, low = 0;

  for (const p of filtered) {
    if (byFunnel[p.funnel] != null) byFunnel[p.funnel]++;
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    const fmt = p.format || 'other';
    byFormat[fmt] = (byFormat[fmt] || 0) + 1;
    if (p.performance === 'high') high++;
    else if (p.performance === 'mid') mid++;
    else low++;
  }

  const topPosts = filtered
    .filter(p => p.performance === 'high')
    .slice(0, 10)
    .map(p => ({
      url: p.url,
      platform: p.platform,
      date: p.date,
      caption: p.caption.slice(0, 100),
      funnel: p.funnel,
      format: p.format,
      metrics: p.metrics,
    }));

  return {
    totalPosts: filtered.length,
    byFunnel,
    byPlatform,
    byFormat,
    performanceSplit: { high, mid, low },
    topPerformers: topPosts,
  };
}
