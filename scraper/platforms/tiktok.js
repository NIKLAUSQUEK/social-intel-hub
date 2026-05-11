/**
 * TikTok scraper — pulls public profile metrics and recent posts
 * Uses yt-dlp for reliable video-level data extraction
 */

import { execFile } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);
const YT_DLP_BIN = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YT_DLP_PATH = join(__dirname_local, '..', '..', 'bin', YT_DLP_BIN);

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract TikTok videos using yt-dlp (bypasses anti-bot)
 */
async function getVideosViaYtDlp(profileUrl) {
  if (!existsSync(YT_DLP_PATH)) {
    console.log('  [TT] yt-dlp binary not found at', YT_DLP_PATH);
    return [];
  }

  return new Promise((resolve) => {
    // --playlist-end caps how deep we fetch (default 200). Override via TT_MAX_VIDEOS env.
    const maxVideos = parseInt(process.env.TT_MAX_VIDEOS) || 200;
    const args = [
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(maxVideos),
      profileUrl,
    ];
    const child = execFile(YT_DLP_PATH, args, { maxBuffer: 100 * 1024 * 1024, timeout: 240000 }, (err, stdout) => {
      if (err) {
        console.log(`  [TT] yt-dlp error: ${err.message}`);
        resolve({ videos: [], totalCount: 0 });
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const totalCount = lines.length; // total posts on the profile
        const videos = lines.slice(0, 12).map((line) => {
          const item = JSON.parse(line);
          return {
            url: item.webpage_url || item.url || '',
            thumbnail: item.thumbnails?.[0]?.url || '',
            caption: item.description || item.title || '',
            views: item.view_count ?? null,
            likes: item.like_count ?? null,
            comments: item.comment_count ?? null,
            shares: item.repost_count ?? null,
            saves: item.save_count ?? null,
            duration: item.duration ?? null,
            date: item.timestamp
              ? new Date(item.timestamp * 1000).toISOString().slice(0, 10)
              : null,
            postType: 'Video',
          };
        });
        console.log(`  [TT] yt-dlp got ${videos.length} videos (${totalCount} total available)`);
        resolve({ videos, totalCount });
      } catch (parseErr) {
        console.log(`  [TT] yt-dlp parse error: ${parseErr.message}`);
        resolve({ videos: [], totalCount: 0 });
      }
    });
  });
}

async function scrapeTikTok(page, client) {
  const config = client.platforms.tiktok;
  if (!config) return null;

  console.log(`  [TT] Scraping ${config.username}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const metrics = await page.evaluate(() => {
        const parseCount = (text) => {
          if (!text) return 0;
          const cleaned = text.replace(/,/g, '').trim();
          const match = cleaned.match(/([\d.]+)\s*(K|M|B)?/i);
          if (!match) return 0;
          const num = parseFloat(match[1]);
          const suffix = (match[2] || '').toUpperCase();
          if (suffix === 'K') return Math.round(num * 1000);
          if (suffix === 'M') return Math.round(num * 1000000);
          if (suffix === 'B') return Math.round(num * 1000000000);
          return Math.round(num);
        };

        // TikTok profile stats — try multiple selectors
        const statElements = document.querySelectorAll('[data-e2e="following-count"], [data-e2e="followers-count"], [data-e2e="likes-count"]');

        let following = 0, followers = 0, likes = 0;

        // Try data-e2e attributes first
        const followingEl = document.querySelector('[data-e2e="following-count"]');
        const followersEl = document.querySelector('[data-e2e="followers-count"]');
        const likesEl = document.querySelector('[data-e2e="likes-count"]');

        if (followingEl) following = parseCount(followingEl.textContent);
        if (followersEl) followers = parseCount(followersEl.textContent);
        if (likesEl) likes = parseCount(likesEl.textContent);

        // Fallback: try header stat counts
        if (followers === 0) {
          const headerStats = document.querySelectorAll('h2[data-e2e] strong, .count-infos strong');
          if (headerStats.length >= 3) {
            following = parseCount(headerStats[0]?.textContent);
            followers = parseCount(headerStats[1]?.textContent);
            likes = parseCount(headerStats[2]?.textContent);
          }
        }

        // Bio
        const bioEl = document.querySelector('[data-e2e="user-bio"]') ||
                      document.querySelector('h2.share-desc');
        const bio = bioEl ? bioEl.textContent.trim() : '';

        // Display name
        const nameEl = document.querySelector('[data-e2e="user-subtitle"]') ||
                       document.querySelector('h1[data-e2e="user-title"]') ||
                       document.querySelector('h2.share-title');
        const displayName = nameEl ? nameEl.textContent.trim() : '';

        return { following, followers, likes, bio, displayName };
      });

      // Scrape recent videos via yt-dlp (reliable) with DOM fallback
      const ytResult = await getVideosViaYtDlp(config.url);
      let recentPosts = ytResult.videos;
      let totalPosts = ytResult.totalCount;
      if (recentPosts.length === 0) {
        console.log('  [TT] yt-dlp returned 0 videos, trying DOM fallback...');
        recentPosts = await scrapeRecentVideos(page);
        totalPosts = recentPosts.length; // DOM fallback can't know total count
      }

      return {
        platform: 'tiktok',
        username: config.username,
        url: config.url,
        ...metrics,
        posts: totalPosts, // total post count on the profile
        recentPosts,
        scrapedAt: new Date().toISOString(),
        success: true,
      };
    } catch (err) {
      console.log(`  [TT] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  return {
    platform: 'tiktok',
    username: config.username,
    url: config.url,
    error: 'Failed after max retries',
    scrapedAt: new Date().toISOString(),
    success: false,
  };
}

async function scrapeRecentVideos(page) {
  try {
    // Method 1: Extract from TikTok's embedded JSON data (__UNIVERSAL_DATA_FOR_REHYDRATION__)
    const jsonPosts = await page.evaluate(() => {
      const script = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (!script) return null;

      try {
        const data = JSON.parse(script.textContent);
        const scope = data.__DEFAULT_SCOPE__;
        if (!scope) return null;

        // Find the user post list in the data
        const userDetail = scope['webapp.user-detail'];
        if (!userDetail) return null;

        const itemList = userDetail.userInfo?.itemList || userDetail.itemList || [];
        return itemList.slice(0, 12).map(item => ({
          url: `https://www.tiktok.com/@${item.author?.uniqueId || ''}/video/${item.id}`,
          thumbnail: item.video?.cover || item.video?.originCover || '',
          caption: item.desc || '',
          views: item.stats?.playCount || null,
          likes: item.stats?.diggCount || null,
          comments: item.stats?.commentCount || null,
          shares: item.stats?.shareCount || null,
          date: item.createTime ? new Date(item.createTime * 1000).toISOString().slice(0, 10) : null,
          postType: 'Video',
        }));
      } catch {
        return null;
      }
    });

    if (jsonPosts && jsonPosts.length > 0) {
      console.log(`  [TT] Got ${jsonPosts.length} videos from embedded JSON`);
      return jsonPosts;
    }

    // Method 2: Fallback to DOM scraping
    const posts = await page.evaluate(() => {
      const videoElements = document.querySelectorAll('[data-e2e="user-post-item"], [class*="DivItemContainer"]');
      const results = [];

      for (let i = 0; i < Math.min(12, videoElements.length); i++) {
        const el = videoElements[i];
        const link = el.querySelector('a');
        const href = link ? link.getAttribute('href') : '';

        const viewEl = el.querySelector('[data-e2e="video-views"], strong');
        const parseCount = (text) => {
          if (!text) return null;
          const cleaned = text.replace(/,/g, '').trim();
          const match = cleaned.match(/([\d.]+)\s*(K|M|B)?/i);
          if (!match) return null;
          const num = parseFloat(match[1]);
          const suffix = (match[2] || '').toUpperCase();
          if (suffix === 'K') return Math.round(num * 1000);
          if (suffix === 'M') return Math.round(num * 1000000);
          return Math.round(num);
        };

        const views = viewEl ? parseCount(viewEl.textContent) : null;
        const img = el.querySelector('img');
        const thumbnail = img ? img.src : '';
        const caption = el.getAttribute('aria-label') || img?.getAttribute('alt') || '';

        results.push({
          url: href.startsWith('http') ? href : `https://www.tiktok.com${href}`,
          thumbnail,
          caption,
          views,
          likes: null,
          comments: null,
          shares: null,
          postType: 'Video',
        });
      }

      return results;
    });

    return posts;
  } catch {
    return [];
  }
}

export { scrapeTikTok };
