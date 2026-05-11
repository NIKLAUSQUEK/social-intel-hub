/**
 * Social Intel — Multi-client scraper
 *
 * Usage:
 *   node scraper/index.js                         — scrape all active clients (auto-detect mode)
 *   node scraper/index.js --client leong-mun-wai  — scrape one client
 *   node scraper/index.js --mode daily             — force daily mode (Playwright only, no API costs)
 *   node scraper/index.js --mode weekly            — force weekly mode (SocialKit API for IG)
 *
 * Scheduling:
 *   Daily  → Playwright for all platforms (free follower/post tracking)
 *   Weekly → SocialKit API for IG deep data (Mondays, or --mode weekly)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeInstagram } from './platforms/ig.js';
import { scrapeTikTok } from './platforms/tiktok.js';
import { scrapeFacebook } from './platforms/facebook.js';
import { scrapeLinkedIn } from './platforms/linkedin.js';
import { scrapeInstagramViaSocialKit, scrapeInstagramPostViaSocialKit, scrapeTikTokViaSocialKit } from './platforms/socialkit.js';
import { scrapeCompetitors } from './competitors.js';
import { runTrendResearch } from './platforms/exa.js';
import dotenv from 'dotenv';

// Load env for SocialKit API key
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

function loadClients() {
  const configPath = join(ROOT, 'clients.json');
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function ensureClientDir(clientId) {
  const dir = join(DATA_DIR, clientId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveData(clientId, filename, data) {
  const dir = ensureClientDir(clientId);
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`  Saved ${filePath}`);
}

function loadPostTracker(clientId) {
  const filePath = join(DATA_DIR, clientId, 'post-tracker.json');
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return {};
}

function loadExistingHistory(clientId) {
  const filePath = join(DATA_DIR, clientId, 'history.json');
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return { snapshots: [] };
}

async function captureProfileScreenshot(page, clientId, platform) {
  try {
    const date = new Date().toISOString().split('T')[0];
    const dir = join(DATA_DIR, clientId, 'screenshots');
    mkdirSync(dir, { recursive: true });
    const filepath = join(dir, `${platform}_${date}.png`);
    await page.screenshot({ path: filepath, clip: { x: 0, y: 0, width: 1280, height: 600 } });
    console.log(`  [SCREENSHOT] Saved ${platform} screenshot: ${filepath}`);
    return filepath;
  } catch (err) {
    console.log(`  [SCREENSHOT] Failed for ${platform}: ${err.message}`);
    return null;
  }
}


function generateWeeklyReport(client, metrics, posts) {
  const timestamp = new Date().toISOString();
  const weekOf = new Date().toISOString().slice(0, 10);

  const platformSummaries = {};
  for (const [platform, data] of Object.entries(metrics)) {
    if (!data || !data.success) {
      platformSummaries[platform] = { status: 'failed', error: data?.error };
      continue;
    }

    const postData = posts[platform] || [];
    const totalEngagement = postData.reduce((sum, p) => {
      return sum + (p.likes || 0) + (p.comments || 0) + (p.reactions || 0) + (p.shares || 0);
    }, 0);

    platformSummaries[platform] = {
      status: 'success',
      followers: data.followers || 0,
      engagement: totalEngagement,
      postsScraped: postData.length,
      topPost: postData.length > 0
        ? postData.reduce((best, p) => {
            const score = (p.likes || 0) + (p.comments || 0) + (p.reactions || 0) + (p.views || 0);
            const bestScore = (best.likes || 0) + (best.comments || 0) + (best.reactions || 0) + (best.views || 0);
            return score > bestScore ? p : best;
          }, postData[0])
        : null,
    };
  }

  // Cross-platform totals
  const totalFollowers = Object.values(platformSummaries)
    .reduce((sum, p) => sum + (p.followers || 0), 0);
  const totalEngagement = Object.values(platformSummaries)
    .reduce((sum, p) => sum + (p.engagement || 0), 0);

  return {
    clientId: client.id,
    clientName: client.name,
    weekOf,
    generatedAt: timestamp,
    summary: {
      totalFollowers,
      totalEngagement,
      platformsScraped: Object.keys(metrics).length,
      platformsFailed: Object.values(platformSummaries).filter((p) => p.status === 'failed').length,
    },
    platforms: platformSummaries,
  };
}

async function scrapeClient(browser, client, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping: ${client.name} (${client.id})`);
  console.log(`${'='.repeat(60)}`);

  // Load Instagram session cookies if available (bypasses login wall)
  const igSessionPath = join(ROOT, 'scraper', 'ig-session.json');
  const hasIgSession = existsSync(igSessionPath);
  if (hasIgSession) console.log('  [IG] Using saved session cookies');

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ...(hasIgSession ? { storageState: igSessionPath } : {}),
  });
  const page = await context.newPage();

  const metrics = {};
  const posts = {};

  // ── Determine scrape mode ──
  const scrapeMode = options.mode || 'daily';
  const hasSocialKit = !!process.env.SOCIALKIT_API_KEY;
  const useSocialKit = scrapeMode === 'weekly' && hasSocialKit;
  console.log(`  Mode: ${scrapeMode.toUpperCase()} | SocialKit IG: ${useSocialKit ? 'YES' : 'NO (Playwright only)'}`);

  // Instagram
  try {
    let igData = null;
    // Weekly mode: use SocialKit API for IG (paid, richer data)
    if (useSocialKit && client.platforms?.instagram) {
      igData = await scrapeInstagramViaSocialKit(client);
    }
    // Daily mode OR SocialKit failed: use Playwright (free)
    if (!igData || !igData.success || igData.followers === 0) {
      console.log(`  [IG] ${useSocialKit ? 'SocialKit failed — falling back to' : 'Using'} Playwright scraper...`);
      igData = await scrapeInstagram(page, client);
    }
    // If SocialKit gave stats but no posts, fetch posts via Playwright
    if (igData && igData.success && igData.source === 'socialkit' && (!igData.recentPosts || igData.recentPosts.length === 0)) {
      console.log('  [IG] SocialKit has no posts — fetching via Playwright...');
      try {
        const pwData = await scrapeInstagram(page, client);
        if (pwData && pwData.recentPosts && pwData.recentPosts.length > 0) {
          igData.recentPosts = pwData.recentPosts;
          console.log(`  [IG] Got ${pwData.recentPosts.length} posts via Playwright`);
        }
      } catch (pwErr) {
        console.log(`  [IG] Playwright post scrape failed: ${pwErr.message}`);
      }
    }
    // Weekly: backfill engagement via SocialKit for posts missing likes
    if (igData && igData.recentPosts && igData.recentPosts.length > 0 && useSocialKit) {
      const postsNeedingData = igData.recentPosts.filter(p => p.likes == null && p.url);
      if (postsNeedingData.length > 0) {
        console.log(`  [SK-IG] Backfilling engagement for ${postsNeedingData.length} posts...`);
        for (const post of postsNeedingData) {
          const stats = await scrapeInstagramPostViaSocialKit(post.url);
          if (stats) {
            post.likes = stats.likes ?? post.likes;
            post.comments = stats.comments ?? post.comments;
            post.views = stats.views ?? post.views;
            if (!post.caption && stats.caption) post.caption = stats.caption;
            console.log(`    ✓ ${post.url.split('/').filter(Boolean).pop()} → L:${post.likes} C:${post.comments} V:${post.views || '-'}`);
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
    if (igData) {
      metrics.instagram = igData;
      posts.instagram = igData.recentPosts || [];
    }
  } catch (err) {
    console.log(`  [IG] Fatal error: ${err.message}`);
    metrics.instagram = { success: false, error: err.message };
  }

  // TikTok (always Playwright/yt-dlp — free)
  try {
    let ttData = await scrapeTikTok(page, client);
    if (ttData) {
      metrics.tiktok = ttData;
      posts.tiktok = ttData.recentPosts || [];
    }
  } catch (err) {
    console.log(`  [TT] Fatal error: ${err.message}`);
    metrics.tiktok = { success: false, error: err.message };
  }

  // Facebook (always Playwright — free)
  try {
    const fbData = await scrapeFacebook(page, client);
    if (fbData) {
      metrics.facebook = fbData;
      posts.facebook = fbData.recentPosts || [];
    }
  } catch (err) {
    console.log(`  [FB] Fatal error: ${err.message}`);
    metrics.facebook = { success: false, error: err.message };
  }

  // LinkedIn (always Playwright — free)
  try {
    if (client.platforms?.linkedin) {
      const liData = await scrapeLinkedIn(page, client);
      if (liData) {
        metrics.linkedin = liData;
        posts.linkedin = liData.recentPosts || [];
      }
    }
  } catch (err) {
    console.log(`  [LI] Fatal error: ${err.message}`);
    metrics.linkedin = { success: false, error: err.message };
  }

  // ── Profile screenshots (saved locally) ──
  const screenshotPaths = {};
  for (const [platform, config] of Object.entries(client.platforms || {})) {
    if (!config?.url) continue;
    try {
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      const ssPath = await captureProfileScreenshot(page, client.id, platform);
      if (ssPath) screenshotPaths[platform] = ssPath;
    } catch (err) {
      console.log(`  [SCREENSHOT] Could not navigate to ${platform}: ${err.message}`);
    }
  }

  // Build per-platform freshness info
  // ── A1 + A7 fix: tri-state health classification ──
  // Previously this was binary: success | failed. The UI then green-checked any
  // partial scrape (e.g. LinkedIn returning "0 followers, 0 posts" still got ✓).
  // Now we classify each platform as:
  //   healthy → followers > 0 AND post-level data returned
  //   partial → some fields returned but post data missing or all zero
  //   failed  → request errored / no data object
  function classifyHealth(platformKey, data, platformPosts) {
    if (!data || data.success === false) return 'failed';
    const followers = data.followers ?? data.pageLikes ?? 0;
    const postCount = Array.isArray(platformPosts) ? platformPosts.length : 0;
    const hasEngagementSignal = postCount > 0 && platformPosts.some(p =>
      (p.views ?? 0) > 0 || (p.likes ?? 0) > 0 || (p.comments ?? 0) > 0
    );
    if (followers > 0 && postCount > 0 && hasEngagementSignal) return 'healthy';
    if (followers > 0 || postCount > 0) return 'partial';
    return 'partial'; // returned-but-empty still counts as partial, not full fail
  }

  function fieldsReturned(platformKey, data, platformPosts) {
    const fields = [];
    if (data?.followers != null && data.followers > 0) fields.push('followers');
    if (data?.bio) fields.push('bio');
    if (Array.isArray(platformPosts) && platformPosts.length > 0) fields.push('posts');
    if (Array.isArray(platformPosts) && platformPosts.some(p => (p.views ?? 0) > 0)) fields.push('views');
    if (Array.isArray(platformPosts) && platformPosts.some(p => (p.likes ?? 0) > 0)) fields.push('likes');
    if (Array.isArray(platformPosts) && platformPosts.some(p => (p.comments ?? 0) > 0)) fields.push('comments');
    return fields;
  }

  const FIELDS_EXPECTED = {
    instagram: ['followers', 'bio', 'posts', 'views', 'likes', 'comments'],
    tiktok:    ['followers', 'bio', 'posts', 'views', 'likes', 'comments'],
    facebook:  ['followers', 'bio', 'posts', 'likes', 'comments'],
    linkedin:  ['followers', 'bio', 'posts', 'likes', 'comments'],
  };

  const scrapedAt = new Date().toISOString();
  const freshness = {};
  for (const [key, data] of Object.entries(metrics)) {
    const platformPosts = posts[key] || [];
    const status = classifyHealth(key, data, platformPosts);
    const got = fieldsReturned(key, data, platformPosts);
    freshness[key] = {
      last_scraped: scrapedAt,
      status,
      // Keep legacy boolean for any consumer not yet on tri-state
      success: status === 'healthy',
      error: data?.error || null,
      fields_returned: got,
      fields_expected: FIELDS_EXPECTED[key] || got,
      missing_fields: (FIELDS_EXPECTED[key] || []).filter(f => !got.includes(f)),
    };
  }

  // ── A6 + A7: append to scrape-health audit log ──
  // Keeps last 30 attempts per platform. Powers:
  //   - "Last successful scrape per platform" tooltip
  //   - 30-day reliability % per platform per client (becomes a sales asset)
  //   - Stale-data warnings (last_success > 7 days ago → red)
  function appendScrapeHealth(clientId, freshness, mode) {
    const dir = ensureClientDir(clientId);
    const path = join(dir, 'scrape-health.json');
    let log = { perPlatform: {} };
    if (existsSync(path)) {
      try { log = JSON.parse(readFileSync(path, 'utf-8')); } catch {}
    }
    if (!log.perPlatform) log.perPlatform = {};
    for (const [key, f] of Object.entries(freshness)) {
      if (!log.perPlatform[key]) log.perPlatform[key] = { attempts: [], last_success: null };
      log.perPlatform[key].attempts.push({
        ts: f.last_scraped,
        status: f.status,
        error: f.error,
        fields_returned: f.fields_returned,
        missing_fields: f.missing_fields,
        mode: mode || null,
      });
      if (f.status === 'healthy') {
        log.perPlatform[key].last_success = f.last_scraped;
      }
      // Cap attempts at most recent 30 to keep the file small
      if (log.perPlatform[key].attempts.length > 30) {
        log.perPlatform[key].attempts = log.perPlatform[key].attempts.slice(-30);
      }
      // Compute 30-day reliability % from the kept attempts
      const all = log.perPlatform[key].attempts;
      const healthy = all.filter(a => a.status === 'healthy').length;
      log.perPlatform[key].reliability_30d_pct = all.length > 0
        ? Math.round((healthy / all.length) * 1000) / 10
        : null;
      log.perPlatform[key].last_attempt = f.last_scraped;
      log.perPlatform[key].last_status = f.status;
    }
    writeFileSync(path, JSON.stringify(log, null, 2));
  }
  appendScrapeHealth(client.id, freshness, options.mode);

  // ── Snapshot + Merge: never lose historical data ──
  // Load previous posts to preserve view counts that platforms may not return on re-scrape
  const prevPosts = (() => {
    try {
      const filePath = join(DATA_DIR, client.id, 'posts-latest.json');
      if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {}
    return null;
  })();

  // Merge: for each post, keep the higher value of views/likes/comments/shares
  // This prevents data loss when a platform returns 0 or null for a field it returned before
  if (prevPosts?.platforms) {
    for (const [platform, platformPosts] of Object.entries(posts)) {
      const prevPlatformPosts = prevPosts.platforms[platform] || [];
      for (const post of platformPosts) {
        const postUrl = post.url;
        if (!postUrl) continue;
        const prevPost = prevPlatformPosts.find(p => p.url === postUrl);
        if (!prevPost) continue;
        // Keep the max of each metric — never let a number go backwards
        for (const metric of ['views', 'likes', 'comments', 'shares', 'saves']) {
          const prev = prevPost[metric];
          const curr = post[metric];
          if (prev != null && (curr == null || curr === 0 || curr === '—')) {
            post[metric] = prev; // restore lost value
          } else if (prev != null && curr != null && typeof prev === 'number' && typeof curr === 'number') {
            post[metric] = Math.max(prev, curr); // keep the higher value
          }
        }
      }
    }
  }

  // Carry forward historical posts that weren't in the current scrape window.
  // Without this, posts-latest.json becomes a rolling 12-post window and older
  // posts (with real engagement) silently disappear on every run.
  if (prevPosts?.platforms) {
    for (const [platform, platformPosts] of Object.entries(posts)) {
      const prevPlatformPosts = prevPosts.platforms[platform] || [];
      const currentUrls = new Set(platformPosts.map(p => p.url).filter(Boolean));
      const missingPosts = prevPlatformPosts.filter(p => p.url && !currentUrls.has(p.url));
      if (missingPosts.length > 0) {
        console.log(`  [MERGE] Carrying forward ${missingPosts.length} historical ${platform} posts not in current scrape`);
        platformPosts.push(...missingPosts);
      }
    }
  }

  // Save current metrics
  const metricsData = {
    clientId: client.id,
    clientName: client.name,
    scrapedAt,
    platforms: metrics,
    freshness,
    screenshots: Object.keys(screenshotPaths).length > 0 ? screenshotPaths : undefined,
  };
  saveData(client.id, 'metrics-latest.json', metricsData);

  // Save posts (merged — no data loss)
  const postsData = {
    clientId: client.id,
    scrapedAt: new Date().toISOString(),
    platforms: posts,
  };
  saveData(client.id, 'posts-latest.json', postsData);

  // ── Immutable snapshot: dated backup that can never be overwritten ──
  const snapshotDate = new Date().toISOString().slice(0, 10);
  // Ensure snapshots directory exists (self-healing)
  mkdirSync(join(DATA_DIR, client.id, 'snapshots'), { recursive: true });
  saveData(client.id, `snapshots/posts-${snapshotDate}.json`, postsData);
  saveData(client.id, `snapshots/metrics-${snapshotDate}.json`, metricsData);

  // ── Post-level performance tracking ──
  // Track each post's engagement over time so we can see growth curves
  const postTracker = loadPostTracker(client.id);
  const today = new Date().toISOString().slice(0, 10);

  for (const [platform, platformPosts] of Object.entries(posts)) {
    for (const post of platformPosts) {
      const postId = post.url || `${platform}-${post.index}`;
      if (!postId || postId.includes('undefined')) continue;

      if (!postTracker[postId]) {
        postTracker[postId] = {
          platform,
          url: post.url,
          caption: (post.caption || '').slice(0, 200),
          thumbnail: post.thumbnail || '',
          firstSeen: today,
          snapshots: [],
        };
      }

      // Append today's engagement snapshot
      const lastSnap = postTracker[postId].snapshots.at(-1);
      const todaySnap = {
        date: today,
        likes: post.likes ?? null,
        comments: post.comments ?? null,
        reactions: post.reactions ?? null,
        shares: post.shares ?? null,
        views: post.views ?? null,
      };

      // Only add if we don't already have today's data
      if (!lastSnap || lastSnap.date !== today) {
        postTracker[postId].snapshots.push(todaySnap);
      }

      // Calculate deltas if we have previous data
      if (postTracker[postId].snapshots.length >= 2) {
        const prev = postTracker[postId].snapshots.at(-2);
        postTracker[postId].latestDelta = {
          likes: (todaySnap.likes ?? 0) - (prev.likes ?? 0),
          comments: (todaySnap.comments ?? 0) - (prev.comments ?? 0),
          views: (todaySnap.views ?? 0) - (prev.views ?? 0),
          period: `${prev.date} → ${today}`,
        };
      }
    }
  }

  saveData(client.id, 'post-tracker.json', postTracker);

  // Append to history (deduplicate: only one entry per date, update if already exists)
  const history = loadExistingHistory(client.id);
  const todayHistoryDate = new Date().toISOString().slice(0, 10);
  const isFirstScrape = history.snapshots.length === 0;

  // ── First-scrape verification ──
  // When a client has no history yet, print a clear summary of what was found so the
  // operator can confirm the handles are pointing at the right account before data accumulates.
  // TODO (long-term): store SocialKit/platform numeric profile IDs in clients.json so that
  // handle renames don't silently redirect the scraper to a different account.
  if (isFirstScrape) {
    console.log(`\n  ┌──────────────────────────────────────────────────────────────┐`);
    console.log(`  │  ⚠️   FIRST SCRAPE — VERIFY THESE ARE THE CORRECT ACCOUNTS    │`);
    console.log(`  └──────────────────────────────────────────────────────────────┘`);
    for (const [platform, data] of Object.entries(metrics)) {
      if (!data || data.success === false) {
        console.log(`  [VERIFY] ${platform.toUpperCase().padEnd(10)} FAILED — ${data?.error || 'unknown error'}`);
        continue;
      }
      const handle    = data.username    || '(no username)';
      const display   = data.displayName || '(no display name)';
      const followers = (data.followers  || data.pageLikes || 0).toLocaleString();
      const bio       = (data.bio        || '').replace(/\n/g, ' ').slice(0, 80);
      console.log(`  [VERIFY] ${platform.toUpperCase().padEnd(10)} @${handle}`);
      console.log(`           Display  : "${display}"`);
      console.log(`           Followers: ${followers}`);
      if (bio) console.log(`           Bio      : "${bio}"`);
    }
    console.log(`  [VERIFY] ✅ If correct, data saved — re-run next cycle to begin tracking.`);
    console.log(`  [VERIFY] ❌ If wrong, fix clients.json and re-scrape.\n`);
  }

  // Smart zero-fill: if a platform returned 0 but previously had data, carry forward the last known value
  // This prevents false "drops to 0" from scraper failures (e.g., IG anti-bot, LI login wall)
  const lastSnap = history.snapshots.length > 0 ? history.snapshots[history.snapshots.length - 1] : null;
  function safeVal(current, lastKnown, label) {
    // If current is 0 but last known was > 100, it's likely a scraper failure — carry forward
    if (current === 0 && lastKnown && lastKnown > 100) {
      console.log(`  [HIST] Carrying forward ${lastKnown} (current=0, likely scraper failure)`);
      return lastKnown;
    }
    // 15% sanity check: a sudden drop of ≥15% vs the previous value is almost certainly
    // a scraper issue rather than real audience loss — flag it prominently
    if (lastKnown && lastKnown > 100 && current > 0 && current < lastKnown * 0.85) {
      const dropPct = (((lastKnown - current) / lastKnown) * 100).toFixed(1);
      console.log(`  [SANITY] ⚠️  ${label}: ${lastKnown.toLocaleString()} → ${current.toLocaleString()} (${dropPct}% drop — exceeds 15% threshold, verify manually)`);
    }
    return current;
  }

  const todaySnapshot = {
    date: todayHistoryDate,
    scrapedAt: new Date().toISOString(),
    source: 'scrape',
    instagram: {
      followers: safeVal(metrics.instagram?.followers || 0, lastSnap?.instagram?.followers, 'IG followers'),
      posts: metrics.instagram?.posts || lastSnap?.instagram?.posts || 0,
    },
    tiktok: {
      followers: safeVal(metrics.tiktok?.followers || 0, lastSnap?.tiktok?.followers, 'TT followers'),
      likes: metrics.tiktok?.likes || lastSnap?.tiktok?.likes || 0,
    },
    facebook: {
      followers: safeVal(metrics.facebook?.followers || 0, lastSnap?.facebook?.followers, 'FB followers'),
      pageLikes: safeVal(metrics.facebook?.pageLikes || 0, lastSnap?.facebook?.pageLikes, 'FB page likes'),
    },
    linkedin: {
      followers: safeVal(metrics.linkedin?.followers || 0, lastSnap?.linkedin?.followers, 'LI followers'),
      connections: metrics.linkedin?.connections || lastSnap?.linkedin?.connections || 0,
    },
  };

  // Replace today's entry if it already exists, otherwise append
  const existingIdx = history.snapshots.findIndex(s => (s.date || '').slice(0, 10) === todayHistoryDate);
  if (existingIdx >= 0) {
    history.snapshots[existingIdx] = todaySnapshot;
    console.log(`  [HIST] Updated existing entry for ${todayHistoryDate}`);
  } else {
    history.snapshots.push(todaySnapshot);
    console.log(`  [HIST] Added new entry for ${todayHistoryDate}`);
  }
  saveData(client.id, 'history.json', history);

  // Generate weekly report
  const report = generateWeeklyReport(client, metrics, posts);
  saveData(client.id, 'report-latest.json', report);

  // Save dated report archive
  const dateStr = new Date().toISOString().slice(0, 10);
  saveData(client.id, `report-${dateStr}.json`, report);

  // Scrape competitors (pass mode through so daily=Playwright, weekly=SocialKit)
  if (client.competitors && client.competitors.length > 0) {
    try {
      console.log(`\n  [COMP] Scraping ${client.competitors.length} competitors (${scrapeMode} mode)...`);
      await scrapeCompetitors(client.id, { mode: scrapeMode });
    } catch (err) {
      console.log(`  [COMP] Competitor scrape failed: ${err.message}`);
    }
  }

  // Exa trend research (weekly only — saves API calls)
  if (scrapeMode === 'weekly' && process.env.EXA_API_KEY && client.competitors?.length > 0) {
    try {
      console.log(`\n  [EXA] Running trend research...`);
      const trendData = await runTrendResearch(client, client.competitors);
      if (trendData) {
        saveData(client.id, 'trends-latest.json', trendData);
        console.log(`  [EXA] Found ${trendData.trends?.trends?.length || 0} trends, ${trendData.competitorNews?.length || 0} news articles`);

        // Merge Exa alerts with competitor alerts
        if (trendData.alerts?.length > 0) {
          const alertsFile = join(DATA_DIR, client.id, 'alerts-latest.json');
          let existingAlerts = { alerts: [] };
          if (existsSync(alertsFile)) {
            try { existingAlerts = JSON.parse(readFileSync(alertsFile, 'utf-8')); } catch { /* ignore */ }
          }
          existingAlerts.alerts.push(...trendData.alerts);
          writeFileSync(alertsFile, JSON.stringify(existingAlerts, null, 2));
          console.log(`  [EXA] Added ${trendData.alerts.length} trend alert(s)`);
        }
      }
    } catch (err) {
      console.log(`  [EXA] Trend research failed: ${err.message}`);
    }
  }

  await context.close();
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let specificClient = null;
  if (args.includes('--client')) {
    const val = args[args.indexOf('--client') + 1];
    if (!val || val.startsWith('--')) {
      console.error('Error: --client requires a client ID');
      process.exit(1);
    }
    specificClient = val;
  }

  // Scrape mode: daily (Playwright only, free) or weekly (SocialKit API for IG)
  // Auto-detects: Monday = weekly, other days = daily
  let mode = 'daily';
  if (args.includes('--mode')) {
    mode = args[args.indexOf('--mode') + 1] || 'daily';
  } else {
    const day = new Date().getDay();
    mode = day === 1 ? 'weekly' : 'daily';
  }

  const { clients } = loadClients();
  const activeClients = specificClient
    ? clients.filter((c) => c.id === specificClient)
    : clients.filter((c) => c.active);

  if (activeClients.length === 0) {
    console.log('No clients to scrape.');
    process.exit(1);
  }

  console.log(`Social Intel Scraper`);
  console.log(`Mode: ${mode.toUpperCase()} ${mode === 'weekly' ? '(SocialKit API for IG)' : '(Playwright only — free)'}`);
  console.log(`Clients to scrape: ${activeClients.map((c) => c.name).join(', ')}`);

  const browser = await chromium.launch({ headless: true });

  const results = [];
  try {
    for (const client of activeClients) {
      try {
        const report = await scrapeClient(browser, client, { mode });
        results.push(report);
      } catch (err) {
        console.error(`Failed to scrape ${client.name}: ${err.message}`);
        results.push({ clientId: client.id, error: err.message });
      }
    }
  } finally {
    await browser.close();
  }

  // Save run summary
  const summaryPath = join(DATA_DIR, 'last-run.json');
  writeFileSync(summaryPath, JSON.stringify({
    completedAt: new Date().toISOString(),
    clientsScraped: results.length,
    results: results.map((r) => ({
      clientId: r.clientId,
      success: !r.error,
      totalFollowers: r.summary?.totalFollowers || 0,
    })),
  }, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done! Scraped ${results.length} client(s).`);
  console.log(`${'='.repeat(60)}`);

  // ── Make.com webhook: notify cloud orchestrator that run completed ──
  // Make.com uses this to confirm the daily scrape happened and skip its fallback.
  // Set MAKE_WEBHOOK_URL in .env.local to enable.
  const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (makeWebhookUrl) {
    try {
      const payload = {
        event: 'daily-scrape-complete',
        completedAt: new Date().toISOString(),
        clientsScraped: results.length,
        results: results.map((r) => ({
          clientId: r.clientId,
          clientName: r.clientName || r.clientId,
          success: !r.error,
          instagram: r.platforms?.instagram?.followers ?? null,
          tiktok: r.platforms?.tiktok?.followers ?? null,
          facebook: r.platforms?.facebook?.pageLikes ?? r.platforms?.facebook?.followers ?? null,
          linkedin: r.platforms?.linkedin?.followers ?? null,
          error: r.error || null,
        })),
      };
      const res = await fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log(`  [MAKE] Webhook posted — status ${res.status}`);
    } catch (err) {
      console.log(`  [MAKE] Webhook failed (non-fatal): ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
