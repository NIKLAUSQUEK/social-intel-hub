/**
 * Aggregator Service
 * Computes content type performance matrix, hook performance rankings,
 * and client health score from classifications and metrics.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

function readClientFile(clientId, filename) {
  const filePath = join(ROOT, 'data', clientId, filename);
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return null;
}

/**
 * Compute content type performance matrix
 * Groups classifications by content_type and computes averages
 */
export function computeContentTypePerformance(classifications, posts) {
  if (!classifications || classifications.length === 0) return [];

  const byType = {};
  for (const c of classifications) {
    const type = c.content_type || 'unknown';
    if (!byType[type]) {
      byType[type] = { posts: [], totalEng: 0, totalViews: 0, totalSentiment: 0 };
    }
    // Find matching post for engagement data
    const post = posts.find(p => (p.url || p.post_id) === c.post_id);
    const eng = post ? ((post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0)) : 0;
    const views = post?.views || 0;

    byType[type].posts.push(c);
    byType[type].totalEng += eng;
    byType[type].totalViews += views;
    byType[type].totalSentiment += (c.sentiment_score || 50);
  }

  const total = classifications.length;
  return Object.entries(byType).map(([type, data]) => ({
    content_type: type,
    post_count: data.posts.length,
    post_percentage: ((data.posts.length / total) * 100).toFixed(1),
    avg_engagement_rate: data.totalViews > 0
      ? ((data.totalEng / data.totalViews) * 100).toFixed(2)
      : '0.00',
    avg_views: data.posts.length > 0 ? Math.round(data.totalViews / data.posts.length) : 0,
    avg_sentiment: data.posts.length > 0 ? Math.round(data.totalSentiment / data.posts.length) : 50,
    performance_index: data.posts.length > 0
      ? ((data.totalEng / data.posts.length) * (data.totalSentiment / data.posts.length / 100)).toFixed(2)
      : '0.00',
  })).sort((a, b) => parseFloat(b.performance_index) - parseFloat(a.performance_index));
}

/**
 * Compute hook performance rankings
 * Groups by hook_type and computes retention + engagement averages
 */
export function computeHookPerformance(classifications, posts) {
  if (!classifications || classifications.length === 0) return [];

  const byHook = {};
  for (const c of classifications) {
    const hook = c.hook_type || 'unknown';
    if (!byHook[hook]) {
      byHook[hook] = { count: 0, totalRetention: 0, totalEng: 0, totalViews: 0 };
    }
    const post = posts.find(p => (p.url || p.post_id) === c.post_id);
    const eng = post ? ((post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0)) : 0;
    const views = post?.views || 0;

    byHook[hook].count++;
    byHook[hook].totalRetention += (c.estimated_retention_pct || 0);
    byHook[hook].totalEng += eng;
    byHook[hook].totalViews += views;
  }

  const results = Object.entries(byHook).map(([hook, data]) => ({
    hook_type: hook,
    use_count: data.count,
    avg_retention_pct: data.count > 0 ? (data.totalRetention / data.count).toFixed(1) : '0.0',
    avg_engagement_rate: data.totalViews > 0
      ? ((data.totalEng / data.totalViews) * 100).toFixed(2)
      : '0.00',
  })).sort((a, b) => parseFloat(b.avg_engagement_rate) - parseFloat(a.avg_engagement_rate));

  // Mark best performer
  if (results.length > 0) {
    results[0].best_performer = true;
  }

  return results;
}

/**
 * Compute client health score (0-100)
 * Weighted: consistency 20%, engagement 25%, growth 20%, hooks 20%, sentiment 15%
 */
export function computeHealthScore(clientId) {
  const metrics = readClientFile(clientId, 'metrics-latest.json');
  const history = readClientFile(clientId, 'history.json');
  const posts = readClientFile(clientId, 'posts-latest.json');
  const classifications = readClientFile(clientId, 'classifications.json');

  const breakdown = {
    consistency: 0,
    engagement: 0,
    growth: 0,
    hooks: 0,
    sentiment: 0,
  };

  // Consistency: based on posting regularity (0-100)
  if (posts?.platforms) {
    const totalPosts = Object.values(posts.platforms).reduce((s, pp) => s + (pp?.length || 0), 0);
    breakdown.consistency = Math.min(100, totalPosts * 10); // 10 posts = 100
  }

  // Engagement: based on avg engagement rate across platforms
  if (posts?.platforms && metrics?.platforms) {
    let totalEng = 0;
    let totalFollowers = 0;
    let postCount = 0;
    for (const [key, pp] of Object.entries(posts.platforms)) {
      for (const p of pp) {
        totalEng += (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
        postCount++;
      }
      const plat = metrics.platforms[key];
      totalFollowers += (plat?.followers || plat?.pageLikes || 0);
    }
    const avgEngPerPost = postCount > 0 ? totalEng / postCount : 0;
    const engRate = totalFollowers > 0 ? (avgEngPerPost / totalFollowers) * 100 : 0;
    breakdown.engagement = Math.min(100, engRate * 20); // 5% eng rate = 100
  }

  // Growth: based on follower trend over history
  if (history?.snapshots?.length >= 2) {
    const snaps = history.snapshots;
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    const getTotal = s => (s?.instagram?.followers || 0) + (s?.tiktok?.followers || 0) +
      (s?.facebook?.pageLikes || s?.facebook?.followers || 0) + (s?.linkedin?.followers || 0);
    const firstTotal = getTotal(first);
    const lastTotal = getTotal(last);
    const growthPct = firstTotal > 0 ? ((lastTotal - firstTotal) / firstTotal) * 100 : 0;
    breakdown.growth = Math.min(100, Math.max(0, 50 + growthPct * 10)); // 0% = 50, 5% = 100
  }

  // Hooks: based on classification diversity
  if (classifications && classifications.length > 0) {
    const uniqueHooks = new Set(classifications.map(c => c.hook_type).filter(Boolean));
    breakdown.hooks = Math.min(100, uniqueHooks.size * 15); // 7 unique hooks = 100
  }

  // Sentiment: average sentiment score from classifications
  if (classifications && classifications.length > 0) {
    const avgSentiment = classifications.reduce((s, c) => s + (c.sentiment_score || 50), 0) / classifications.length;
    breakdown.sentiment = Math.round(avgSentiment);
  } else {
    breakdown.sentiment = 50; // neutral default
  }

  // Weighted total
  const score = Math.round(
    breakdown.consistency * 0.20 +
    breakdown.engagement * 0.25 +
    breakdown.growth * 0.20 +
    breakdown.hooks * 0.20 +
    breakdown.sentiment * 0.15
  );

  // Trend from recent history
  let trend = 'flat';
  if (history?.snapshots?.length >= 3) {
    const snaps = history.snapshots;
    const getTotal = s => (s?.instagram?.followers || 0) + (s?.tiktok?.followers || 0);
    const recent = getTotal(snaps[snaps.length - 1]);
    const prev = getTotal(snaps[snaps.length - 3]);
    if (recent > prev) trend = 'up';
    else if (recent < prev) trend = 'down';
  }

  return {
    health_score: Math.min(100, Math.max(0, score)),
    score_breakdown: breakdown,
    trend,
  };
}
