/**
 * SocialKit API scraper — pulls profile metrics and post stats
 * via api.socialkit.dev (no login required, no Playwright needed)
 *
 * Endpoints used:
 *   GET /instagram/channel-stats?url=...&access_key=...
 *   GET /instagram/stats?url=...&access_key=...
 *   GET /tiktok/channel-stats?url=...&access_key=...
 *   GET /tiktok/stats?url=...&access_key=...
 */

const BASE = 'https://api.socialkit.dev';

async function fetchSocialKit(endpoint, params) {
  const key = process.env.SOCIALKIT_API_KEY;
  if (!key) throw new Error('SOCIALKIT_API_KEY not set in .env.local');

  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('access_key', key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SocialKit ${endpoint} error (${res.status}): ${errText}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`SocialKit returned success=false: ${JSON.stringify(json)}`);
  return json.data;
}

// ── Instagram ──────────────────────────────────

async function scrapeInstagramViaSocialKit(client) {
  const config = client.platforms?.instagram;
  if (!config) return null;

  console.log(`  [SK-IG] Fetching profile for ${config.username}...`);

  try {
    const profile = await fetchSocialKit('/instagram/channel-stats', { url: config.url });

    return {
      platform: 'instagram',
      username: profile.username || config.username,
      url: config.url,
      displayName: profile.nickname || '',
      followers: profile.followers || 0,
      following: profile.following || 0,
      posts: profile.totalPosts || 0,
      bio: profile.bio || '',
      avatar: profile.avatar || '',
      verified: profile.verified || false,
      recentPosts: [],
      scrapedAt: new Date().toISOString(),
      success: true,
      source: 'socialkit',
    };
  } catch (err) {
    console.log(`  [SK-IG] Failed: ${err.message}`);
    return null;
  }
}

async function scrapeInstagramPostViaSocialKit(postUrl) {
  try {
    // SocialKit needs /p/CODE/ or /reel/CODE/ format — strip username prefix
    let cleanUrl = postUrl;
    const postMatch = postUrl.match(/\/(p|reel)\/([^/]+)/);
    if (postMatch) {
      cleanUrl = `https://www.instagram.com/${postMatch[1]}/${postMatch[2]}/`;
    }
    const data = await fetchSocialKit('/instagram/stats', { url: cleanUrl });
    return {
      url: postUrl,
      likes: (data.likes != null && data.likes >= 0) ? data.likes : null,
      comments: (data.comments != null && data.comments >= 0) ? data.comments : null,
      views: (data.views != null && data.views >= 0) ? data.views : null,
      caption: data.title || data.description || '',
      duration: data.duration || null,
      thumbnail: data.thumbnailUrl || '',
      author: data.channelName || '',
    };
  } catch {
    return null;
  }
}

// ── TikTok ─────────────────────────────────────

async function scrapeTikTokViaSocialKit(client) {
  const config = client.platforms?.tiktok;
  if (!config) return null;

  console.log(`  [SK-TT] Fetching profile for ${config.username}...`);

  try {
    const profile = await fetchSocialKit('/tiktok/channel-stats', { url: config.url });

    return {
      platform: 'tiktok',
      username: profile.username || config.username,
      url: config.url,
      displayName: profile.nickname || '',
      followers: profile.followers || 0,
      following: profile.following || 0,
      likes: profile.totalLikes || 0,
      totalVideos: profile.totalVideos || 0,
      bio: profile.signature || '',
      avatar: profile.avatar || '',
      verified: profile.verified || false,
      bioLink: profile.bioLink || '',
      scrapedAt: new Date().toISOString(),
      success: true,
      source: 'socialkit',
    };
  } catch (err) {
    console.log(`  [SK-TT] Failed: ${err.message}`);
    return null;
  }
}

async function scrapeTikTokVideoViaSocialKit(videoUrl) {
  try {
    const data = await fetchSocialKit('/tiktok/stats', { url: videoUrl });
    return {
      url: videoUrl,
      videoId: data.videoId || '',
      caption: data.title || '',
      views: data.views || 0,
      likes: data.likes || 0,
      comments: data.comments || 0,
      shares: data.shares || 0,
      duration: data.duration || null,
      thumbnail: data.thumbnailUrl || '',
      author: data.channelName || '',
    };
  } catch {
    return null;
  }
}

// ── Competitor profiles (batch) ────────────────

async function scrapeCompetitorViaSocialKit(competitor) {
  const result = { name: competitor.name, party: competitor.party };

  // TikTok profile
  if (competitor.tiktok) {
    try {
      console.log(`  [SK-TT] Competitor: ${competitor.name}...`);
      const profile = await fetchSocialKit('/tiktok/channel-stats', { url: competitor.tiktok });
      result.tiktok = {
        followers: profile.followers || 0,
        totalLikes: profile.totalLikes || 0,
        totalVideos: profile.totalVideos || 0,
        username: profile.username || '',
        verified: profile.verified || false,
      };
    } catch (err) {
      console.log(`    [SK-TT] ${competitor.name} failed: ${err.message}`);
    }
  }

  // Instagram profile
  if (competitor.instagram) {
    try {
      console.log(`  [SK-IG] Competitor: ${competitor.name}...`);
      const profile = await fetchSocialKit('/instagram/channel-stats', { url: competitor.instagram });
      result.instagram = {
        followers: profile.followers || 0,
        following: profile.following || 0,
        totalPosts: profile.totalPosts || 0,
        username: profile.username || '',
        verified: profile.verified || false,
      };
    } catch (err) {
      console.log(`    [SK-IG] ${competitor.name} failed: ${err.message}`);
    }
  }

  return result;
}

export {
  scrapeInstagramViaSocialKit,
  scrapeInstagramPostViaSocialKit,
  scrapeTikTokViaSocialKit,
  scrapeTikTokVideoViaSocialKit,
  scrapeCompetitorViaSocialKit,
};
