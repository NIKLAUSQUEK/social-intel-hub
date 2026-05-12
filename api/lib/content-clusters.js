/**
 * Cross-platform content cluster detection (A11).
 *
 * Same campaign idea often posted to multiple platforms within hours of each
 * other. The dashboard currently shows them as unrelated rows. This module
 * detects clusters so we can compare format-vs-format lift on the same idea.
 *
 * Algorithm:
 *   1. Tokenise each post's caption → bag of cleaned words (no stopwords,
 *      hashtags stripped, URLs stripped, lowercase, dedup'd).
 *   2. For each pair of posts (different platforms), compute Jaccard
 *      similarity of their token bags. If ≥ 0.4 AND posted within 72 hours,
 *      cluster them.
 *   3. Union-find groups so triples (IG + TT + FB same idea) merge.
 *   4. For each cluster, compute relative lift per platform vs the cluster's
 *      median engagement-per-view (or engagement-per-follower fallback).
 *
 * Returns an array of clusters, each with:
 *   { id, posts: [...], dominantPlatform, summary, lifts: { platform: multiplier } }
 */

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','to','of','for','in','on','at','by','with',
  'from','as','is','are','was','were','be','been','being','it','its','this','that',
  'these','those','i','you','we','they','my','your','our','their','me','him','her',
  'us','them','will','would','can','could','should','may','might','do','does','did',
  'have','has','had','not','no','nor','so','just','only','very','too','also','really',
  'about','more','most','some','any','all','one','two','three','out','up','down','over',
  'into','than','then','when','where','why','how','what','who','which','here','there',
]);

function tokenise(caption) {
  if (!caption) return new Set();
  let s = String(caption).toLowerCase();
  // strip URLs
  s = s.replace(/https?:\/\/\S+/g, ' ');
  // strip mentions + hashtags (keep the word inside hashtag — often the idea)
  s = s.replace(/[@#]([\w]+)/g, ' $1 ');
  // strip emoji + non-letter except spaces
  s = s.replace(/[^\p{Letter}\p{Number}\s]/gu, ' ');
  const toks = s.split(/\s+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(toks);
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function postDate(p) {
  // Normalise date — posts have `date` as either ISO or "April 6, 2026"
  const d = p.date ? new Date(p.date) : null;
  if (!d || isNaN(d.getTime())) return null;
  return d.getTime();
}

function postEngagement(p) {
  return (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
}

export function detectContentClusters(postsByPlatform, opts = {}) {
  const minSim = opts.minSimilarity ?? 0.4;
  const windowMs = (opts.maxHoursApart ?? 72) * 3600 * 1000;

  // Flatten + tokenise
  const flat = [];
  for (const [platform, arr] of Object.entries(postsByPlatform || {})) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      const t = tokenise(p.caption);
      const ts = postDate(p);
      if (t.size < 3 || !ts) continue;
      flat.push({ ...p, platform, _tokens: t, _ts: ts, _eng: postEngagement(p) });
    }
  }
  if (flat.length < 2) return [];

  // Union-find over cross-platform pairs that pass the similarity + time gates
  const parent = flat.map((_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[i].platform === flat[j].platform) continue; // cross-platform only
      if (Math.abs(flat[i]._ts - flat[j]._ts) > windowMs) continue;
      const sim = jaccard(flat[i]._tokens, flat[j]._tokens);
      if (sim >= minSim) union(i, j);
    }
  }

  // Build clusters of size ≥ 2
  const groups = new Map();
  for (let i = 0; i < flat.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(flat[i]);
  }

  const out = [];
  let clusterIdx = 0;
  for (const posts of groups.values()) {
    if (posts.length < 2) continue;
    // Compute per-post engagement-per-view (or fall back to raw eng)
    const erValues = posts.map(p => {
      const v = p.views || 0;
      return v > 0 ? p._eng / v : null;
    }).filter(v => v != null);
    const medER = median(erValues);
    const lifts = {};
    let dominantPlatform = null, dominantMultiple = 0;
    for (const p of posts) {
      const v = p.views || 0;
      const er = v > 0 ? p._eng / v : null;
      const mult = er != null && medER > 0 ? er / medER : null;
      lifts[p.platform] = lifts[p.platform] || [];
      if (mult != null) lifts[p.platform].push(mult);
      if (mult != null && mult > dominantMultiple) {
        dominantMultiple = mult;
        dominantPlatform = p.platform;
      }
    }
    const liftSummary = {};
    for (const [pf, arr] of Object.entries(lifts)) {
      if (arr.length === 0) continue;
      liftSummary[pf] = +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2);
    }
    // Pick the cluster summary: highest-engagement post's first 80 chars
    const top = [...posts].sort((a, b) => b._eng - a._eng)[0];
    out.push({
      id: 'cluster-' + (++clusterIdx),
      summary: (top.caption || '').slice(0, 100),
      dominantPlatform,
      dominantMultiple: +dominantMultiple.toFixed(2),
      lifts: liftSummary,
      postCount: posts.length,
      posts: posts.map(p => ({
        platform: p.platform,
        url: p.url,
        caption: (p.caption || '').slice(0, 120),
        date: p.date,
        views: p.views || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        engagement: p._eng,
        er: p.views > 0 ? +((p._eng / p.views) * 100).toFixed(2) : null,
      })).sort((a, b) => b.engagement - a.engagement),
    });
  }
  // Sort by post count desc then by dominant multiple
  out.sort((a, b) => (b.postCount - a.postCount) || (b.dominantMultiple - a.dominantMultiple));
  return out;
}
