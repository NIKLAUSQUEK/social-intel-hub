/**
 * Competitor intelligence scraper
 *
 * Scheduling strategy:
 *   Daily scrapes  → Playwright only (free) for follower tracking
 *   Weekly scrapes → SocialKit API (paid) for deep IG data + post backfill
 *
 * Usage:
 *   scrapeCompetitors(clientId)                    — auto-detect (weekly on Mondays)
 *   scrapeCompetitors(clientId, { mode: 'daily' }) — force Playwright only
 *   scrapeCompetitors(clientId, { mode: 'weekly' })— force SocialKit + Playwright
 */

import { execFile } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { chromium } from 'playwright';
import {
  scrapeInstagramPostViaSocialKit,
  scrapeCompetitorViaSocialKit,
} from './platforms/socialkit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const YT_DLP_BIN = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YT_DLP_PATH = join(__dirname, '..', 'bin', YT_DLP_BIN);
const DATA_DIR = join(__dirname, '..', 'data');

const BASE = 'https://api.socialkit.dev';

// ── Determine scrape mode ────────────────────────

function determineScrapeMode(override) {
  if (override === 'daily' || override === 'weekly') return override;
  // Auto: weekly on Mondays, daily otherwise
  const day = new Date().getDay(); // 0=Sun, 1=Mon
  return day === 1 ? 'weekly' : 'daily';
}

// ── SocialKit IG scraper (weekly only — saves cost) ──

async function scrapeInstagramViaSocialKitFull(igUrl) {
  const key = process.env.SOCIALKIT_API_KEY;
  if (!key) return null;

  try {
    const profileUrl = new URL(`${BASE}/instagram/channel-stats`);
    profileUrl.searchParams.set('access_key', key);
    profileUrl.searchParams.set('url', igUrl);

    const profileRes = await fetch(profileUrl.toString(), { signal: AbortSignal.timeout(30000) });
    if (!profileRes.ok) return null;
    const profileJson = await profileRes.json();
    if (!profileJson.success) return null;
    const profile = profileJson.data;

    const result = {
      followers: profile.followers || 0,
      following: profile.following || 0,
      posts: [],
      avgEngagement: 0,
      url: igUrl,
      avatar: profile.avatar || '',
      username: profile.username || '',
      verified: profile.verified || false,
      source: 'socialkit',
    };

    if (profile.recentPosts && profile.recentPosts.length > 0) {
      result.posts = profile.recentPosts.slice(0, 6).map(p => ({
        url: p.url || '',
        postType: p.type || (p.url?.includes('/reel/') ? 'Reel' : 'Image'),
        likes: p.likes || 0,
        comments: p.comments || 0,
        views: p.views || 0,
        caption: (p.caption || p.title || '').slice(0, 200),
        thumbnail: p.thumbnailUrl || p.thumbnail || '',
      }));
    }

    return result;
  } catch (err) {
    console.log(`  [SK-IG] Competitor scrape failed: ${err.message}`);
    return null;
  }
}

async function fetchPostStatsSocialKit(postUrl) {
  const key = process.env.SOCIALKIT_API_KEY;
  if (!key) return null;
  return scrapeInstagramPostViaSocialKit(postUrl);
}

// ── TikTok via yt-dlp (always free) ──

async function scrapeTikTok(url) {
  if (!existsSync(YT_DLP_PATH)) return null;

  const videos = await new Promise((resolve) => {
    const args = ['--flat-playlist', '--dump-json', url];
    execFile(YT_DLP_PATH, args, { maxBuffer: 50 * 1024 * 1024, timeout: 90000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        const lines = stdout.trim().split('\n');
        const vids = lines.slice(0, 12).map((line) => {
          const item = JSON.parse(line);
          return {
            url: item.webpage_url || '',
            caption: item.description || item.title || '',
            thumbnail: item.thumbnail || (item.thumbnails && item.thumbnails.length > 0 ? item.thumbnails[item.thumbnails.length - 1].url : '') || '',
            views: item.view_count ?? 0,
            likes: item.like_count ?? 0,
            comments: item.comment_count ?? 0,
            shares: item.repost_count ?? 0,
            saves: item.save_count ?? 0,
            duration: item.duration ?? 0,
            date: item.timestamp ? new Date(item.timestamp * 1000).toISOString().slice(0, 10) : null,
          };
        });
        resolve(vids);
      } catch { resolve([]); }
    });
  });

  return { videos, totalVideos: videos.length };
}

// ── Instagram via Playwright (free — used daily) ──

async function scrapeInstagramPlaywright(url, page) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const data = await page.evaluate(() => {
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const desc = ogDesc ? ogDesc.getAttribute('content') : '';
      const followersMatch = desc.match(/([\d,.]+[KMB]?)\s*Followers/i);
      const followingMatch = desc.match(/([\d,.]+[KMB]?)\s*Following/i);

      const parseNum = (s) => {
        if (!s) return 0;
        s = s.replace(/,/g, '');
        if (s.endsWith('K')) return parseFloat(s) * 1000;
        if (s.endsWith('M')) return parseFloat(s) * 1000000;
        return parseInt(s, 10) || 0;
      };

      return {
        followers: parseNum(followersMatch?.[1]),
        following: parseNum(followingMatch?.[1]),
      };
    });

    const postLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('article a[href*="/p/"], a[href*="/reel/"]');
      return Array.from(links).slice(0, 6).map((el) => ({
        url: 'https://www.instagram.com' + el.getAttribute('href'),
        postType: el.getAttribute('href').includes('/reel/') ? 'Reel' : 'Image',
      }));
    });

    const posts = [];
    for (const link of postLinks) {
      try {
        await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const postData = await page.evaluate(() => {
          const ogDesc = document.querySelector('meta[property="og:description"]');
          const desc = ogDesc ? ogDesc.getAttribute('content') : '';
          const likesMatch = desc.match(/([\d,]+)\s*likes?/i);
          const commentsMatch = desc.match(/([\d,]+)\s*comments?/i);
          const parseNum = (s) => s ? parseInt(s.replace(/,/g, ''), 10) : 0;
          return {
            likes: parseNum(likesMatch?.[1]),
            comments: parseNum(commentsMatch?.[1]),
            caption: desc.slice(desc.indexOf('-') + 1).trim().slice(0, 200),
          };
        });
        posts.push({ ...link, ...postData });
      } catch { /* skip failed posts */ }
    }

    return { ...data, posts };
  } catch (err) {
    console.log(`  [COMP] IG Playwright scrape failed: ${err.message}`);
    return null;
  }
}

// ── LinkedIn via Playwright (public profiles — no login needed for basics) ──

async function scrapeLinkedIn(url, page) {
  try {
    // LinkedIn public profiles expose data in meta tags even without login
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const title = ogTitle ? ogTitle.getAttribute('content') : '';
      const desc = ogDesc ? ogDesc.getAttribute('content') : '';
      const avatar = ogImage ? ogImage.getAttribute('content') : '';

      // Try to extract follower count from page text
      const pageText = document.body?.innerText || '';
      const followersMatch = pageText.match(/([\d,.]+[KMB]?)\s*followers/i);
      const connectionsMatch = pageText.match(/([\d,.]+)\+?\s*connections/i);

      const parseNum = (s) => {
        if (!s) return 0;
        s = s.replace(/,/g, '').replace('+', '');
        if (s.endsWith('K')) return parseFloat(s) * 1000;
        if (s.endsWith('M')) return parseFloat(s) * 1000000;
        if (s.endsWith('B')) return parseFloat(s) * 1000000000;
        return parseInt(s, 10) || 0;
      };

      return {
        name: title.split(' - ')[0]?.trim() || title.split('|')[0]?.trim() || '',
        headline: desc.split('·')[0]?.trim() || desc.split('|')[0]?.trim() || '',
        avatar: avatar || '',
        followers: parseNum(followersMatch?.[1]),
        connections: parseNum(connectionsMatch?.[1]),
        description: desc.slice(0, 300),
      };
    });

    // Try to scrape recent posts/activity (visible on public profiles)
    const posts = await page.evaluate(() => {
      const postEls = document.querySelectorAll('[data-urn*="activity"], .feed-shared-update-v2, .occludable-update');
      return Array.from(postEls).slice(0, 6).map(el => {
        const text = el.innerText?.slice(0, 300) || '';
        const likesMatch = text.match(/([\d,]+)\s*(?:likes?|reactions?)/i);
        const commentsMatch = text.match(/([\d,]+)\s*comments?/i);
        const parseNum = (s) => s ? parseInt(s.replace(/,/g, ''), 10) : 0;
        return {
          text: text.slice(0, 200),
          likes: parseNum(likesMatch?.[1]),
          comments: parseNum(commentsMatch?.[1]),
          postType: 'Post',
        };
      }).filter(p => p.text.length > 20);
    });

    return {
      platform: 'linkedin',
      url,
      name: data.name,
      headline: data.headline,
      avatar: data.avatar,
      followers: data.followers,
      connections: data.connections,
      description: data.description,
      posts,
      avgEngagement: posts.length > 0
        ? Math.round(posts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0), 0) / posts.length)
        : 0,
      success: true,
      source: 'playwright',
    };
  } catch (err) {
    console.log(`  [COMP] LinkedIn scrape failed: ${err.message}`);
    return null;
  }
}

// ── LinkedIn company page scraper ──

async function scrapeLinkedInCompany(url, page) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const title = ogTitle ? ogTitle.getAttribute('content') : '';
      const desc = ogDesc ? ogDesc.getAttribute('content') : '';
      const avatar = ogImage ? ogImage.getAttribute('content') : '';

      const pageText = document.body?.innerText || '';
      const followersMatch = pageText.match(/([\d,.]+[KMB]?)\s*followers/i);
      const employeesMatch = pageText.match(/([\d,.]+[KMB]?)\s*(?:employees|on LinkedIn)/i);

      const parseNum = (s) => {
        if (!s) return 0;
        s = s.replace(/,/g, '').replace('+', '');
        if (s.endsWith('K')) return parseFloat(s) * 1000;
        if (s.endsWith('M')) return parseFloat(s) * 1000000;
        return parseInt(s, 10) || 0;
      };

      return {
        name: title.split(' |')[0]?.trim() || '',
        description: desc.slice(0, 300),
        avatar: avatar || '',
        followers: parseNum(followersMatch?.[1]),
        employees: parseNum(employeesMatch?.[1]),
      };
    });

    return {
      platform: 'linkedin',
      url,
      ...data,
      posts: [],
      avgEngagement: 0,
      success: true,
      source: 'playwright',
    };
  } catch (err) {
    console.log(`  [COMP] LinkedIn company scrape failed: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// ██  MAIN COMPETITOR SCRAPE
// ═══════════════════════════════════════════════════

export async function scrapeCompetitors(clientId, options = {}) {
  const clientsFile = join(__dirname, '..', 'clients.json');
  const clients = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = clients.find((c) => c.id === clientId);

  if (!client?.competitors?.length) {
    console.log('  [COMP] No competitors configured');
    return null;
  }

  // ── Determine scrape mode ──
  const mode = determineScrapeMode(options.mode);
  const useSocialKit = mode === 'weekly' && !!process.env.SOCIALKIT_API_KEY;

  console.log(`  [COMP] Scraping ${client.competitors.length} competitors...`);
  console.log(`  [COMP] Mode: ${mode.toUpperCase()} | SocialKit: ${useSocialKit ? 'YES (weekly)' : 'NO (Playwright only)'}`);

  // Always launch browser (needed for Playwright daily scrapes + LinkedIn)
  // Wrapped in try/finally to prevent orphaned browser processes
  const browser = await chromium.launch({ headless: true });
  let browserClosed = false;

  // Load IG session cookies if available
  const igSessionPath = join(__dirname, 'ig-session.json');
  const hasIgSession = existsSync(igSessionPath);
  const contextOpts = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(hasIgSession ? { storageState: igSessionPath } : {}),
  };
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  try { // try/finally ensures browser.close() on any error

  // Load previous data for change detection
  const prevFile = join(DATA_DIR, clientId, 'competitors-latest.json');
  let previousData = null;
  if (existsSync(prevFile)) {
    try { previousData = JSON.parse(readFileSync(prevFile, 'utf-8')); } catch { /* ignore */ }
  }

  const results = [];
  const alerts = [];

  for (const comp of client.competitors) {
    console.log(`  [COMP] Scraping ${comp.name}...`);
    const result = {
      name: comp.name,
      party: comp.party || comp.category || null,
      scrapedAt: new Date().toISOString(),
      tiktok: null,
      instagram: null,
      linkedin: null,
    };

    // ── TikTok (always free via yt-dlp) ──
    if (comp.tiktok) {
      result.tiktok = await scrapeTikTok(comp.tiktok);
      if (result.tiktok) {
        const totalEng = result.tiktok.videos.reduce((s, v) => s + v.likes + v.comments + v.shares, 0);
        const totalViews = result.tiktok.videos.reduce((s, v) => s + v.views, 0);
        result.tiktok.avgEngagement = result.tiktok.videos.length > 0 ? Math.round(totalEng / result.tiktok.videos.length) : 0;
        result.tiktok.avgViews = result.tiktok.videos.length > 0 ? Math.round(totalViews / result.tiktok.videos.length) : 0;
        result.tiktok.url = comp.tiktok;
        console.log(`    TT: ${result.tiktok.videos.length} videos, avg ${result.tiktok.avgViews} views`);

        // Detect viral videos (>5x average)
        for (const vid of result.tiktok.videos) {
          if (result.tiktok.avgViews > 0 && vid.views > result.tiktok.avgViews * 5) {
            alerts.push({
              type: 'viral_video',
              severity: 'high',
              competitor: comp.name,
              platform: 'tiktok',
              message: `${comp.name} has a viral TikTok with ${vid.views.toLocaleString()} views (${Math.round(vid.views / result.tiktok.avgViews)}x their average)`,
              data: { url: vid.url, views: vid.views, likes: vid.likes, caption: (vid.caption || '').slice(0, 100) },
            });
          }
        }
      }
    }

    // ── Instagram ──
    if (comp.instagram) {
      let igData = null;

      if (useSocialKit) {
        // WEEKLY: Use SocialKit API for rich IG data
        console.log(`    [SK-IG] Weekly mode — using SocialKit for ${comp.name}...`);
        igData = await scrapeInstagramViaSocialKitFull(comp.instagram);
        if (igData) {
          console.log(`    [SK-IG] ✓ ${igData.followers} followers, ${igData.posts.length} posts`);
        }
      }

      // DAILY or SocialKit failed: Use Playwright (free)
      if (!igData || (igData.followers === 0 && igData.posts.length === 0)) {
        console.log(`    [PW-IG] ${mode === 'daily' ? 'Daily mode' : 'Fallback'} — Playwright for ${comp.name}...`);
        igData = await scrapeInstagramPlaywright(comp.instagram, page);
      }

      // Weekly: backfill post engagement via SocialKit
      if (useSocialKit && igData && igData.posts?.length > 0) {
        for (const post of igData.posts) {
          if ((post.likes == null || post.likes === 0) && post.url) {
            const stats = await fetchPostStatsSocialKit(post.url);
            if (stats) {
              post.likes = stats.likes ?? post.likes;
              post.comments = stats.comments ?? post.comments;
              post.views = stats.views ?? post.views;
              if (!post.thumbnail && stats.thumbnail) post.thumbnail = stats.thumbnail;
              if (!post.caption && stats.caption) post.caption = stats.caption;
            }
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }

      if (igData) {
        const igEng = igData.posts?.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0), 0) || 0;
        igData.avgEngagement = igData.posts?.length > 0 ? Math.round(igEng / igData.posts.length) : 0;
        igData.url = comp.instagram;
        result.instagram = igData;
        console.log(`    IG: ${igData.followers} followers, ${igData.posts?.length || 0} posts, avg eng ${igData.avgEngagement}`);
      }
    }

    // ── LinkedIn (always Playwright — free) ──
    if (comp.linkedin) {
      console.log(`    [LI] Scraping LinkedIn for ${comp.name}...`);
      const isCompanyPage = comp.linkedin.includes('/company/');
      const liData = isCompanyPage
        ? await scrapeLinkedInCompany(comp.linkedin, page)
        : await scrapeLinkedIn(comp.linkedin, page);
      if (liData) {
        result.linkedin = liData;
        console.log(`    LI: ${liData.followers} followers, ${liData.posts?.length || 0} posts`);
      }
    }

    // ── Change detection vs previous scrape ──
    if (previousData) {
      const prev = previousData.competitors?.find(c => c.name === comp.name);
      if (prev) {
        // IG follower spike
        if (prev.instagram?.followers && result.instagram?.followers) {
          const change = result.instagram.followers - prev.instagram.followers;
          const pctChange = (change / prev.instagram.followers) * 100;
          if (pctChange > 5) {
            alerts.push({
              type: 'follower_spike',
              severity: pctChange > 20 ? 'high' : 'medium',
              competitor: comp.name,
              platform: 'instagram',
              message: `${comp.name} gained ${change.toLocaleString()} IG followers (+${pctChange.toFixed(1)}%) since last scrape`,
              data: { before: prev.instagram.followers, after: result.instagram.followers, change, pctChange },
            });
          }
        }
        // IG engagement spike
        if (prev.instagram?.avgEngagement && result.instagram?.avgEngagement) {
          if (result.instagram.avgEngagement > prev.instagram.avgEngagement * 2 && result.instagram.avgEngagement - prev.instagram.avgEngagement > 50) {
            alerts.push({
              type: 'engagement_spike',
              severity: 'medium',
              competitor: comp.name,
              platform: 'instagram',
              message: `${comp.name} IG engagement surged from avg ${prev.instagram.avgEngagement} to ${result.instagram.avgEngagement}`,
              data: { before: prev.instagram.avgEngagement, after: result.instagram.avgEngagement },
            });
          }
        }
        // LinkedIn follower spike
        if (prev.linkedin?.followers && result.linkedin?.followers) {
          const change = result.linkedin.followers - prev.linkedin.followers;
          const pctChange = prev.linkedin.followers > 0 ? (change / prev.linkedin.followers) * 100 : 0;
          if (pctChange > 5 || change > 500) {
            alerts.push({
              type: 'follower_spike',
              severity: pctChange > 15 ? 'high' : 'medium',
              competitor: comp.name,
              platform: 'linkedin',
              message: `${comp.name} gained ${change.toLocaleString()} LinkedIn followers (+${pctChange.toFixed(1)}%)`,
              data: { before: prev.linkedin.followers, after: result.linkedin.followers, change, pctChange },
            });
          }
        }
      }
    }

    results.push(result);
  }

  await browser.close();
  browserClosed = true;

  // Save competitor data
  const outDir = join(DATA_DIR, clientId);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'competitors-latest.json');
  const data = {
    clientId,
    scrapedAt: new Date().toISOString(),
    scrapeMode: mode,
    competitors: results,
  };
  writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log(`  [COMP] Saved ${outFile}`);

  // Save alerts
  if (alerts.length > 0) {
    const alertsFile = join(outDir, 'alerts-latest.json');
    const alertData = { clientId, generatedAt: new Date().toISOString(), alerts };

    const alertHistoryFile = join(outDir, 'alerts-history.json');
    let history = [];
    if (existsSync(alertHistoryFile)) {
      try { history = JSON.parse(readFileSync(alertHistoryFile, 'utf-8')); } catch { /* ignore */ }
    }
    history.push(...alerts.map(a => ({ ...a, timestamp: new Date().toISOString() })));
    if (history.length > 100) history = history.slice(-100);

    writeFileSync(alertsFile, JSON.stringify(alertData, null, 2));
    writeFileSync(alertHistoryFile, JSON.stringify(history, null, 2));
    console.log(`  [COMP] 🔔 ${alerts.length} alert(s) detected!`);
    alerts.forEach(a => console.log(`    ${a.severity === 'high' ? '🔴' : '🟡'} ${a.message}`));
  }

  return { ...data, alerts };

  } finally {
    if (!browserClosed) {
      try { await browser.close(); } catch (_) { /* already closed */ }
    }
  }
}
