/**
 * Meta Graph API insights — pulls REAL post timestamps + engagement metrics
 * for the client's own IG Business account (must be linked to a Facebook Page).
 *
 * Uses the user-access-token flow:
 *   1. /me/accounts → get pages + IG Business Account IDs
 *   2. Match the client's IG handle to one of those accounts
 *   3. Fetch /{ig-media-id}/insights for each post → real published timestamp + reach
 *
 * Falls back gracefully when Meta unavailable.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

function getUserToken() {
  return process.env.META_USER_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '';
}

async function graphGet(path, params = {}) {
  const token = getUserToken();
  if (!token) throw new Error('META_USER_ACCESS_TOKEN not set');
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Meta Graph: ${msg}`);
    err.code = json.error?.code;
    err.subcode = json.error?.error_subcode;
    throw err;
  }
  return json;
}

// ── Connectivity check (cached) ────────────────────

let _availabilityCache = null;
let _availabilityCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function checkMetaAvailable() {
  const now = Date.now();
  if (_availabilityCache && (now - _availabilityCacheAt) < CACHE_TTL_MS) {
    return _availabilityCache;
  }

  if (!getUserToken()) {
    _availabilityCache = { ok: false, reason: 'META_USER_ACCESS_TOKEN not set' };
    _availabilityCacheAt = now;
    return _availabilityCache;
  }

  try {
    const me = await graphGet('/me', { fields: 'id,name' });
    _availabilityCache = { ok: true, user: me.name, userId: me.id };
  } catch (err) {
    let reason = err.message;
    if (err.code === 190) reason = 'Token expired — regenerate at developers.facebook.com/tools/explorer/';
    _availabilityCache = { ok: false, reason };
  }
  _availabilityCacheAt = now;
  return _availabilityCache;
}

// ── Resolve client's IG Business Account from their handle ──

export async function findIGBusinessForHandle(igUsername) {
  const accounts = await graphGet('/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username,followers_count}',
    limit: 100,
  });

  if (!accounts.data?.length) {
    throw new Error('User admins zero Facebook Pages — cannot access IG insights without a Page');
  }

  const target = accounts.data.find(p =>
    p.instagram_business_account?.username?.toLowerCase() === igUsername.toLowerCase(),
  );

  if (!target) {
    const available = accounts.data
      .map(p => p.instagram_business_account?.username)
      .filter(Boolean);
    throw new Error(
      `No Page linked to IG @${igUsername}. Available IG handles: ${available.join(', ') || '(none)'}`,
    );
  }

  return {
    pageId: target.id,
    pageName: target.name,
    pageAccessToken: target.access_token,
    igBusinessAccountId: target.instagram_business_account.id,
    igUsername: target.instagram_business_account.username,
    followers: target.instagram_business_account.followers_count,
  };
}

// ── Fetch real post timestamps + insights ──────────

/**
 * Returns array of { mediaId, timestamp, mediaType, productType, insights }
 * Use timestamp for accurate hour-of-day analysis.
 */
export async function fetchPostInsights(igBusinessAccountId, opts = {}) {
  const limit = opts.limit || 50;

  // Step 1: list media IDs + timestamps (no extra cost, single call)
  const media = await graphGet(`/${igBusinessAccountId}/media`, {
    fields: 'id,timestamp,media_type,media_product_type,permalink,caption',
    limit,
  });

  const items = media.data || [];
  if (!items.length) return [];

  // Step 2: per-post insights (parallel batches of 5)
  const enriched = [];
  const BATCH = 5;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (m) => {
      try {
        // Available metrics depend on media_type — request the broadest safe set
        const metricList = m.media_product_type === 'REELS'
          ? 'reach,saved,total_interactions,plays,comments,likes,shares'
          : (m.media_type === 'VIDEO'
              ? 'reach,saved,total_interactions,comments,likes,shares'
              : 'reach,saved,total_interactions,comments,likes');
        const ins = await graphGet(`/${m.id}/insights`, { metric: metricList });
        const flat = {};
        for (const item of (ins.data || [])) {
          flat[item.name] = item.values?.[0]?.value ?? null;
        }
        return {
          mediaId: m.id,
          permalink: m.permalink,
          timestamp: m.timestamp,
          mediaType: m.media_type,
          productType: m.media_product_type,
          caption: (m.caption || '').slice(0, 200),
          insights: flat,
        };
      } catch (err) {
        return {
          mediaId: m.id,
          permalink: m.permalink,
          timestamp: m.timestamp,
          mediaType: m.media_type,
          productType: m.media_product_type,
          caption: (m.caption || '').slice(0, 200),
          insightsError: err.message,
        };
      }
    }));
    enriched.push(...results);
  }

  return enriched;
}

// ── Hour-of-day analysis from real timestamps ──────

/**
 * Bucket posts by hour-of-day + day-of-week, scoring by reach or interactions.
 * Returns { byHour: {0..23 → metric}, byDow: {0..6 → metric}, byHourDow: matrix }
 */
export function analyseTrueTimes(insights, scoreField = 'reach') {
  const byHour = Array.from({ length: 24 }, () => ({ hour: 0, posts: 0, sum: 0, avg: null }));
  const byDow  = Array.from({ length: 7 },  () => ({ dow: 0,  posts: 0, sum: 0, avg: null }));
  const matrix = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ posts: 0, sum: 0, avg: null })),
  );

  for (const post of insights) {
    if (!post.timestamp) continue;
    const score = post.insights?.[scoreField]
               || post.insights?.total_interactions
               || ((post.insights?.likes || 0) + (post.insights?.comments || 0) + (post.insights?.shares || 0));
    if (score == null || score === 0) continue;

    const d = new Date(post.timestamp);
    const hour = d.getHours();
    const dow = (d.getDay() + 6) % 7; // Mon=0

    byHour[hour].posts++;  byHour[hour].sum += score;
    byDow[dow].posts++;    byDow[dow].sum  += score;
    matrix[dow][hour].posts++;
    matrix[dow][hour].sum += score;
  }

  // Compute averages
  for (let h = 0; h < 24; h++) {
    byHour[h].hour = h;
    byHour[h].avg = byHour[h].posts ? byHour[h].sum / byHour[h].posts : null;
  }
  for (let d = 0; d < 7; d++) {
    byDow[d].dow = d;
    byDow[d].avg = byDow[d].posts ? byDow[d].sum / byDow[d].posts : null;
  }
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      matrix[d][h].avg = matrix[d][h].posts ? matrix[d][h].sum / matrix[d][h].posts : null;
    }
  }

  // Top 5 (day, hour) windows
  const flat = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h].posts >= 1 && matrix[d][h].avg != null) {
        flat.push({ dow: d, hour: h, posts: matrix[d][h].posts, avg: matrix[d][h].avg });
      }
    }
  }
  flat.sort((a, b) => b.avg - a.avg);

  return {
    byHour,
    byDow,
    matrix,
    topWindows: flat.slice(0, 5),
    sampleSize: insights.length,
  };
}
