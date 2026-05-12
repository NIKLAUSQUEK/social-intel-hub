/**
 * A12 + C3 — Niche baselines: cross-client aggregation for "vs niche" comparisons.
 *
 * Walks every active client, buckets them by inferred niche (same logic as the
 * dashboard client-picker), and computes medians for:
 *   - posting cadence (posts/week per platform)
 *   - engagement rate per post (engagement / views)
 *   - follower count
 *   - top-decile cutoff for each
 *
 * Result is cached on disk; refresh once a day or when the user explicitly asks.
 *
 * Used by:
 *   - Overview percentile badges ("Top 25% in F&B niche")
 *   - Strategy tab leaderboard ("You post 5×/wk, niche median 7×/wk, top 10% posts 9×/wk")
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_PATH = join(ROOT, 'logs', 'niche-baselines.json');
const CACHE_TTL_MS = 24 * 3600 * 1000; // 24h

function nicheBucket(niche) {
  const n = (niche || '').toLowerCase();
  if (/fnb|food|claypot|hawker|coffee|restaurant|kitchen|bain|hae|peng|baozai|shinian/.test(n)) return 'F&B';
  if (/fitness|coach|wellness|rehab|physio|clinic|health|gym/.test(n)) return 'Health & Wellness';
  if (/property|invest|finance|wealth|business|founder|entrepreneur|growth/.test(n)) return 'Business & Finance';
  if (/educ|teach|tuition|course|learn|tutor/.test(n)) return 'Education';
  if (/podcast|content|creator|media|influencer/.test(n)) return 'Creator / Media';
  if (/politic|policy|mp|leong/.test(n)) return 'Politics & Civic';
  return 'Other';
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * p));
  return s[idx];
}

function median(arr) { return percentile(arr, 0.5); }

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } }

export function computeNicheBaselines({ force = false } = {}) {
  if (!force && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
      if (cached.generated_at && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
        return cached;
      }
    } catch {}
  }

  const clients = readJson(join(ROOT, 'clients.json'))?.clients || [];
  const byNiche = {};

  for (const c of clients) {
    if (c.active === false) continue;
    const niche = nicheBucket(c.niche);
    if (!byNiche[niche]) byNiche[niche] = { clients: [], postsPerWeek: {}, engRate: {}, followers: {} };

    const metrics = readJson(join(DATA_DIR, c.id, 'metrics-latest.json'));
    const posts = readJson(join(DATA_DIR, c.id, 'posts-latest.json'));
    byNiche[niche].clients.push(c.id);

    if (metrics?.platforms) {
      for (const [pf, p] of Object.entries(metrics.platforms)) {
        const followers = p?.followers || p?.pageLikes || 0;
        if (followers > 0) {
          if (!byNiche[niche].followers[pf]) byNiche[niche].followers[pf] = [];
          byNiche[niche].followers[pf].push(followers);
        }
      }
    }

    if (posts?.platforms) {
      for (const [pf, arr] of Object.entries(posts.platforms)) {
        if (!Array.isArray(arr) || arr.length === 0) continue;
        // Posting cadence (last 28 days)
        const cutoff = Date.now() - 28 * 86400000;
        const recent = arr.filter(p => {
          const d = p.date ? new Date(p.date) : null;
          return d && d.getTime() > cutoff;
        });
        const postsPerWeek = (recent.length / 28) * 7;
        if (postsPerWeek > 0) {
          if (!byNiche[niche].postsPerWeek[pf]) byNiche[niche].postsPerWeek[pf] = [];
          byNiche[niche].postsPerWeek[pf].push(postsPerWeek);
        }
        // Engagement rate per post
        const ers = arr
          .filter(p => (p.views || 0) > 0)
          .map(p => (((p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0)) / p.views) * 100);
        if (ers.length > 0) {
          if (!byNiche[niche].engRate[pf]) byNiche[niche].engRate[pf] = [];
          byNiche[niche].engRate[pf].push(...ers);
        }
      }
    }
  }

  // Reduce to median + p90 + count per (niche, platform, metric)
  const baselines = {};
  for (const [niche, n] of Object.entries(byNiche)) {
    baselines[niche] = { clientCount: n.clients.length, platforms: {} };
    const pfs = new Set([
      ...Object.keys(n.postsPerWeek),
      ...Object.keys(n.engRate),
      ...Object.keys(n.followers),
    ]);
    for (const pf of pfs) {
      baselines[niche].platforms[pf] = {
        postsPerWeek_median: median(n.postsPerWeek[pf] || []),
        postsPerWeek_p90: percentile(n.postsPerWeek[pf] || [], 0.9),
        postsPerWeek_n: (n.postsPerWeek[pf] || []).length,
        engRate_median: median(n.engRate[pf] || []),
        engRate_p90: percentile(n.engRate[pf] || [], 0.9),
        engRate_n: (n.engRate[pf] || []).length,
        followers_median: median(n.followers[pf] || []),
        followers_p90: percentile(n.followers[pf] || [], 0.9),
        followers_n: (n.followers[pf] || []).length,
      };
    }
  }

  const out = { generated_at: new Date().toISOString(), niches: baselines };
  try { writeFileSync(CACHE_PATH, JSON.stringify(out, null, 2)); } catch {}
  return out;
}

export function nicheFor(client) {
  return nicheBucket(client?.niche);
}
