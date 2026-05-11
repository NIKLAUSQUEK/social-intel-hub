/**
 * Apify comment scrapers — Instagram + TikTok
 *
 * Uses synchronous run-sync-get-dataset-items endpoint to fetch comments
 * in a single HTTP call per actor (vs async run + poll).
 *
 * Cost (April 2026):
 *   IG comment scraper: ~$0.002 per 100 comments
 *   TikTok comment scraper: ~$0.003 per 100 comments
 *
 * Actor IDs (configurable via .env.local):
 *   APIFY_IG_COMMENTS_ACTOR  default apify/instagram-comment-scraper
 *   APIFY_TT_COMMENTS_ACTOR  default clockworks/tiktok-comments-scraper
 */

const APIFY_BASE = 'https://api.apify.com/v2';

function getToken() {
  const t = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!t) throw new Error('APIFY_TOKEN not set in .env.local');
  return t;
}

async function runActor(actorId, input, { maxMs = 120_000 } = {}) {
  const token = getToken();
  // Actor IDs with slashes need URL encoding
  const encoded = actorId.replace('/', '~');
  const url = `${APIFY_BASE}/acts/${encoded}/run-sync-get-dataset-items?token=${token}&timeout=${Math.floor(maxMs / 1000)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(maxMs + 5000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify ${actorId} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Instagram ──────────────────────────────────────

export async function scrapeIGComments(postUrls, limitPerPost = 50) {
  if (!postUrls?.length) return [];

  const actor = process.env.APIFY_IG_COMMENTS_ACTOR || 'apify/instagram-comment-scraper';
  const input = {
    directUrls: postUrls.slice(0, 50),        // hard cap for safety
    resultsLimit: limitPerPost,
    isNewestComments: true,
  };

  try {
    const rows = await runActor(actor, input);
    // Normalise output — actors vary slightly in field names
    return rows.map(r => ({
      platform: 'instagram',
      postUrl: r.postUrl || r.ownerUrl || '',
      commentId: r.id || r.commentId || '',
      text: r.text || r.comment || '',
      likes: r.likesCount || r.likes || 0,
      timestamp: r.timestamp || r.createdAt || null,
      author: r.ownerUsername || r.username || '',
      repliesCount: r.repliesCount || 0,
    })).filter(c => c.text);
  } catch (err) {
    console.log(`  [APIFY-IG] ${err.message}`);
    return [];
  }
}

// ── TikTok ─────────────────────────────────────────

export async function scrapeTikTokComments(videoUrls, limitPerVideo = 50) {
  if (!videoUrls?.length) return [];

  const actor = process.env.APIFY_TT_COMMENTS_ACTOR || 'clockworks/tiktok-comments-scraper';
  const input = {
    postURLs: videoUrls.slice(0, 50),
    commentsPerPost: limitPerVideo,
    maxRepliesPerComment: 0,
  };

  try {
    const rows = await runActor(actor, input);
    return rows.map(r => ({
      platform: 'tiktok',
      postUrl: r.videoWebUrl || r.postUrl || '',
      commentId: r.cid || r.id || '',
      text: r.text || '',
      likes: r.diggCount || r.likes || 0,
      timestamp: r.createTimeISO || r.createTime || null,
      author: r.uniqueId || r.username || '',
      repliesCount: r.replyCommentTotal || 0,
    })).filter(c => c.text);
  } catch (err) {
    console.log(`  [APIFY-TT] ${err.message}`);
    return [];
  }
}

// ── Cost estimator ─────────────────────────────────

export function estimateApifyCost(igComments, ttComments) {
  const igCost = (igComments / 100) * 0.002;
  const ttCost = (ttComments / 100) * 0.003;
  return { igCost, ttCost, total: igCost + ttCost };
}
