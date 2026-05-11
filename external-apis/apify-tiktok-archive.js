/**
 * Apify TikTok historical archive scraper — pulls FULL post archive.
 * Different from yt-dlp which is capped to recent ~36 posts on TikTok's web feed.
 *
 * Uses Apify actor: clockworks/tiktok-scraper (bundled with most Apify accounts).
 * Cost (April 2026): ~$0.30 per 1000 posts.
 *
 * Setup: APIFY_TOKEN already set; this just needs the actor enabled.
 */

const APIFY_BASE = 'https://api.apify.com/v2';

function getToken() {
  const t = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!t) throw new Error('APIFY_TOKEN not set');
  return t;
}

async function runActor(actorId, input, { maxMs = 600_000 } = {}) {
  const token = getToken();
  const encoded = actorId.replace('/', '~');
  const url = `${APIFY_BASE}/acts/${encoded}/run-sync-get-dataset-items?token=${token}&timeout=${Math.floor(maxMs / 1000)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(maxMs + 10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify ${actorId} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch up to maxPosts posts from a TikTok profile (or list of profiles).
 * Returns posts with timestamps, captions, metrics — going as deep as the actor can.
 */
export async function fetchProfileHistory(profileUrls, opts = {}) {
  const actor = process.env.APIFY_TT_PROFILE_ACTOR || 'clockworks/tiktok-scraper';
  const maxPosts = opts.maxPosts || 200;

  const input = {
    profiles: Array.isArray(profileUrls) ? profileUrls : [profileUrls],
    resultsPerPage: maxPosts,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    profileScrapeSections: ['videos'],
    profileSorting: opts.sort || 'latest', // 'latest' | 'oldest' | 'popular'
  };

  const items = await runActor(actor, input, { maxMs: 600_000 });
  return items.map(p => ({
    url: p.webVideoUrl || p.url,
    videoId: p.id,
    caption: p.text || '',
    views: p.playCount ?? null,
    likes: p.diggCount ?? null,
    comments: p.commentCount ?? null,
    shares: p.shareCount ?? null,
    saves: p.collectCount ?? null,
    duration: p.videoMeta?.duration ?? null,
    createTime: p.createTimeISO || (p.createTime ? new Date(p.createTime * 1000).toISOString() : null),
    music: p.musicMeta?.musicName,
    musicAuthor: p.musicMeta?.musicAuthor,
    hashtags: (p.hashtags || []).map(h => h.name).filter(Boolean),
    mentions: (p.mentions || []),
    author: p.authorMeta?.name,
    fromArchive: true,
  })).filter(p => p.url);
}

/**
 * Estimate what date range we got back.
 */
export function dateRange(posts) {
  const withDates = posts.filter(p => p.createTime).sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
  if (!withDates.length) return null;
  return {
    earliest: withDates[0].createTime,
    latest: withDates[withDates.length - 1].createTime,
    count: withDates.length,
  };
}
