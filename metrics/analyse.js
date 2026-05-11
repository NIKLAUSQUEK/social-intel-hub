/**
 * Metrics analyser — best posting times + engagement audit.
 *
 * Best times:
 *   - Day-of-week from REAL scraped post data per client (when available)
 *   - Hour-of-day from PLATFORM BENCHMARKS (scraped posts don't include hour info)
 *   - Combines both into "Tue 11am-1pm" style recommendations
 *
 * Engagement audit:
 *   - Computes engagement rate per post (likes+comments+shares / max(views, followers))
 *   - Flags missing/null metrics so the dashboard can be honest about what's measurable
 *   - Per-platform completeness score
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkMetaAvailable, findIGBusinessForHandle, fetchPostInsights, analyseTrueTimes } from './meta-insights.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

// ── Industry-standard prime times (fallback for hour-of-day) ──
// Sources: Buffer / HeyOrca / Sprout Social aggregated reports.
// Times stored in 24h, treat as creator's local timezone.
export const PLATFORM_PRIME_HOURS = {
  instagram: {
    weekday: ['11:00-13:00', '17:00-19:00', '20:00-22:00'],
    weekend: ['10:00-12:00', '20:00-22:00'],
    note: 'Reels peak Mon-Wed lunch + early evening. Carousels: weekend mornings.',
  },
  tiktok: {
    weekday: ['18:00-22:00', '06:00-09:00'],
    weekend: ['09:00-12:00', '19:00-23:00'],
    note: 'TikTok algorithm rewards consistency over precise timing — frequency > slot.',
  },
  linkedin: {
    weekday: ['07:00-09:00', '12:00-13:00', '17:00-18:00'],
    weekend: [],
    note: 'B2B audience reads on commute + lunch. Avoid weekends entirely (engagement -60%).',
  },
  facebook: {
    weekday: ['13:00-15:00', '19:00-21:00'],
    weekend: ['12:00-14:00'],
    note: 'Organic reach extremely low — paid boost recommended for any meaningful audience.',
  },
};

// Day labels in our preferred weekly order
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ────────────────────────────────────────

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getDayOfWeek(date) {
  // 0=Sun → re-map to Mon-start: Mon=0..Sun=6
  return (date.getDay() + 6) % 7;
}

/**
 * Engagement rate per post.
 * Formula:  (likes + comments + shares + saves) / denominator
 *
 * denominator preference:
 *   1. views       (most accurate for video — IG Reels, TikTok)
 *   2. followers   (reasonable proxy for static posts)
 *   3. null        (uncomputable — flag to user)
 *
 * Returns { rate: 0-1 number or null, denominatorUsed: 'views' | 'followers' | null }
 */
export function computeEngagementRate(post, followers) {
  const likes = post.likes ?? 0;
  const comments = post.comments ?? 0;
  const shares = post.shares ?? 0;
  const saves = post.saves ?? 0;
  const interactions = likes + comments + shares + saves;

  if (post.views && post.views > 0) {
    return { rate: interactions / post.views, denominatorUsed: 'views', interactions };
  }
  if (followers && followers > 0) {
    return { rate: interactions / followers, denominatorUsed: 'followers', interactions };
  }
  return { rate: null, denominatorUsed: null, interactions };
}

// ── Day-of-week analysis from real post data ──────

export function analyseDayOfWeek(clientId) {
  const posts = readJson(join(DATA_DIR, clientId, 'posts-latest.json'));
  const metrics = readJson(join(DATA_DIR, clientId, 'metrics-latest.json'));
  if (!posts) return null;

  const platforms = posts.platforms || posts;
  const result = {};

  for (const [plat, list] of Object.entries(platforms)) {
    const arr = Array.isArray(list) ? list : (list?.posts || []);
    if (!arr.length) continue;

    // Get followers for this platform (denominator fallback)
    const followers = metrics?.platforms?.[plat]?.followers ?? null;

    // Bucket by day-of-week
    const buckets = Array.from({ length: 7 }, () => ({
      day: '',
      postCount: 0,
      avgEngagement: null,
      sumInteractions: 0,
      sumDenominator: 0,
    }));

    for (const post of arr) {
      const date = parseDate(post.date);
      if (!date) continue;
      const dow = getDayOfWeek(date);
      const er = computeEngagementRate(post, followers);
      if (er.rate == null) continue; // skip uncomputable posts

      buckets[dow].postCount++;
      buckets[dow].sumInteractions += er.interactions;
      buckets[dow].sumDenominator += (post.views && post.views > 0) ? post.views : (followers || 0);
    }

    for (let i = 0; i < 7; i++) {
      buckets[i].day = DAYS[i];
      buckets[i].avgEngagement = buckets[i].sumDenominator > 0
        ? buckets[i].sumInteractions / buckets[i].sumDenominator
        : null;
    }

    // Rank days by avg engagement (only those with at least 2 data points)
    const ranked = [...buckets]
      .filter(b => b.postCount >= 2 && b.avgEngagement != null)
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    result[plat] = {
      buckets,
      topDays: ranked.slice(0, 3),
      sampleSize: arr.length,
      followers,
    };
  }

  return result;
}

// ── Combined recommendation (day from data + hour from benchmarks) ──

export function recommendBestTimes(clientId) {
  const dayData = analyseDayOfWeek(clientId);
  if (!dayData) return null;

  const recommendations = {};
  for (const [plat, analysis] of Object.entries(dayData)) {
    const benchmarks = PLATFORM_PRIME_HOURS[plat];
    if (!benchmarks) continue;

    const recs = [];
    // For each top-performing day, pair it with platform's prime hours
    for (const dayBucket of analysis.topDays) {
      const isWeekend = dayBucket.day === 'Sat' || dayBucket.day === 'Sun';
      const hours = isWeekend ? benchmarks.weekend : benchmarks.weekday;
      for (const hourRange of hours) {
        recs.push({
          day: dayBucket.day,
          hour: hourRange,
          score: dayBucket.avgEngagement,
          source: 'day-from-data + hour-from-benchmark',
        });
      }
    }

    // If we didn't have enough day data, fall back to pure benchmarks
    if (recs.length === 0) {
      const fallbackDays = isPlatformBusinessHours(plat) ? ['Tue', 'Wed', 'Thu'] : ['Tue', 'Wed', 'Thu', 'Sat'];
      for (const day of fallbackDays.slice(0, 3)) {
        const isWeekend = day === 'Sat' || day === 'Sun';
        const hours = isWeekend ? benchmarks.weekend : benchmarks.weekday;
        for (const hourRange of hours.slice(0, 1)) {
          recs.push({
            day, hour: hourRange,
            score: null,
            source: 'industry-benchmark (no client data yet)',
          });
        }
      }
    }

    recommendations[plat] = {
      topRecommendations: recs.slice(0, 5),
      dataConfidence: analysis.topDays.length >= 3 ? 'high' : analysis.topDays.length > 0 ? 'medium' : 'low',
      sampleSize: analysis.sampleSize,
      benchmarkNote: benchmarks.note,
    };
  }

  return recommendations;
}

function isPlatformBusinessHours(plat) {
  return plat === 'linkedin';
}

// ── Meta-powered best times (REAL hour-of-day from API) ──

const DAY_LABELS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Returns Meta-powered best-times analysis if available, null otherwise.
 * Uses REAL post timestamps from Meta Graph API, not benchmarks.
 */
export async function recommendBestTimesViaMeta(clientId) {
  // Resolve client → IG handle
  const clientsFile = join(__dirname, '..', 'clients.json');
  if (!existsSync(clientsFile)) return null;
  const all = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients || [];
  const client = all.find(c => c.id === clientId);
  if (!client) return null;
  const igHandle = client.platforms?.instagram?.username;
  if (!igHandle) return { ok: false, reason: 'Client has no Instagram handle in clients.json' };

  // Check Meta availability
  const avail = await checkMetaAvailable();
  if (!avail.ok) return { ok: false, reason: avail.reason };

  // Find IG Business Account for this handle
  let business;
  try { business = await findIGBusinessForHandle(igHandle); }
  catch (err) { return { ok: false, reason: err.message }; }

  // Fetch insights
  let insights;
  try { insights = await fetchPostInsights(business.igBusinessAccountId, { limit: 50 }); }
  catch (err) { return { ok: false, reason: 'fetch insights: ' + err.message }; }

  if (!insights.length) return { ok: false, reason: 'No posts returned by Meta Graph for this account' };

  const analysis = analyseTrueTimes(insights, 'reach');
  return {
    ok: true,
    source: 'meta-graph-api',
    igHandle,
    igBusinessAccountId: business.igBusinessAccountId,
    pageId: business.pageId,
    pageName: business.pageName,
    sampleSize: analysis.sampleSize,
    topWindows: analysis.topWindows.map(w => ({
      day: DAY_LABELS_FULL[w.dow],
      hour: `${String(w.hour).padStart(2, '0')}:00-${String((w.hour + 1) % 24).padStart(2, '0')}:00`,
      avgReach: Math.round(w.avg),
      sampleSize: w.posts,
    })),
    byHour: analysis.byHour.map((h, i) => ({ hour: i, avgReach: h.avg ? Math.round(h.avg) : null, posts: h.posts })),
    byDay: analysis.byDow.map((d, i) => ({ day: DAY_LABELS_FULL[i], avgReach: d.avg ? Math.round(d.avg) : null, posts: d.posts })),
  };
}

// ── Engagement metrics audit (data quality + accuracy) ──

export function auditMetrics(clientId) {
  const posts = readJson(join(DATA_DIR, clientId, 'posts-latest.json'));
  const metrics = readJson(join(DATA_DIR, clientId, 'metrics-latest.json'));
  if (!posts) return null;

  const platforms = posts.platforms || posts;
  const audit = {};

  for (const [plat, list] of Object.entries(platforms)) {
    const arr = Array.isArray(list) ? list : (list?.posts || []);
    if (!arr.length) {
      audit[plat] = { postCount: 0, status: 'no-posts' };
      continue;
    }

    const followers = metrics?.platforms?.[plat]?.followers ?? null;

    // Field completeness
    const fields = ['views', 'likes', 'comments', 'shares', 'saves', 'date', 'caption'];
    const completeness = {};
    for (const f of fields) {
      const present = arr.filter(p => p[f] != null && p[f] !== '').length;
      completeness[f] = {
        count: present,
        percent: Math.round((present / arr.length) * 100),
      };
    }

    // Engagement rate distribution
    const rates = [];
    let computable = 0;
    let denomViews = 0;
    let denomFollowers = 0;
    for (const p of arr) {
      const er = computeEngagementRate(p, followers);
      if (er.rate != null) {
        rates.push(er.rate);
        computable++;
        if (er.denominatorUsed === 'views') denomViews++;
        else if (er.denominatorUsed === 'followers') denomFollowers++;
      }
    }
    rates.sort((a, b) => a - b);
    const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
    const avg = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;

    audit[plat] = {
      postCount: arr.length,
      followers,
      completeness,
      computableEngagement: { count: computable, percent: Math.round((computable / arr.length) * 100) },
      denominatorBreakdown: { views: denomViews, followers: denomFollowers, uncomputable: arr.length - computable },
      engagementStats: {
        avg: avg != null ? Number(avg.toFixed(4)) : null,
        median: median != null ? Number(median.toFixed(4)) : null,
        sampleSize: rates.length,
      },
      issues: detectIssues(plat, completeness, computable, arr.length),
    };
  }

  return audit;
}

function detectIssues(plat, completeness, computable, total) {
  const issues = [];
  if (computable < total * 0.5) {
    issues.push(`Only ${computable}/${total} posts have computable engagement — many missing both views and follower count`);
  }
  if (plat === 'instagram' && completeness.views.percent < 30) {
    issues.push('IG views <30% populated — IG only exposes views for Reels with insights access. Engagement rate falls back to follower-denominator (less accurate).');
  }
  if (completeness.date.percent < 90) {
    issues.push(`Only ${completeness.date.percent}% of posts have a date — best-times analysis is degraded`);
  }
  if (completeness.shares.percent === 0 && plat === 'tiktok') {
    issues.push('TikTok shares not captured — engagement rate undercounts virality signal');
  }
  return issues;
}
