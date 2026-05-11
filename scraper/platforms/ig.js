/**
 * Instagram scraper — pulls public profile metrics and recent posts
 *
 * Fallback chain (most → least reliable):
 *   1. Playwright DOM scraping (with session cookies if available)
 *   2. Meta tags fallback (login wall detected)
 *   3. HTTP fetch of profile page HTML (no browser needed, parses og:description)
 *   4. Carry forward last known value (done in index.js)
 */

import fetch from 'node-fetch';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP-only fallback — fetch IG profile page raw HTML and parse meta tags.
 * No Playwright needed. Works when browser is blocked but HTTP with the
 * right headers still returns the page shell with og:description intact.
 */
async function scrapeInstagramViaHttp(config) {
  console.log('  [IG] Trying HTTP meta-tag fallback (no browser)...');
  try {
    const res = await fetch(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
      timeout: 15000,
    });
    if (!res.ok) {
      console.log(`  [IG] HTTP fallback returned ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Parse og:description — "5,519 Followers, 43 Following, 303 Posts - ..."
    const ogMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
                 || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i);
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
                 || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);

    if (!ogMatch) {
      console.log('  [IG] HTTP fallback: no og:description found');
      return null;
    }

    const desc = ogMatch[1];
    const parseCount = (text) => {
      const m = text.match(/([\d.]+)\s*(K|M|B)?/i);
      if (!m) return 0;
      const num = parseFloat(m[1]);
      const suffix = (m[2] || '').toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      return Math.round(num);
    };

    let followers = 0, following = 0, posts = 0;
    const followerMatch = desc.match(/([\d,.]+[KMB]?)\s*Followers/i);
    const followingMatch = desc.match(/([\d,.]+[KMB]?)\s*Following/i);
    const postsMatch = desc.match(/([\d,.]+[KMB]?)\s*Posts/i);
    if (followerMatch) followers = parseCount(followerMatch[1].replace(/,/g, ''));
    if (followingMatch) following = parseCount(followingMatch[1].replace(/,/g, ''));
    if (postsMatch) posts = parseCount(postsMatch[1].replace(/,/g, ''));

    if (followers === 0) {
      console.log('  [IG] HTTP fallback: could not parse followers from meta');
      return null;
    }

    console.log(`  [IG] HTTP fallback success: ${followers} followers`);
    return {
      platform: 'instagram',
      username: config.username,
      url: config.url,
      followers,
      following,
      posts,
      displayName: ogTitle ? ogTitle[1].split('(')[0].trim() : '',
      bio: desc,
      recentPosts: [],
      scrapedAt: new Date().toISOString(),
      success: true,
      source: 'http-meta',
      note: 'Scraped from HTTP meta tags (no browser)',
    };
  } catch (err) {
    console.log(`  [IG] HTTP fallback failed: ${err.message}`);
    return null;
  }
}

async function scrapeInstagram(page, client) {
  const config = client.platforms.instagram;
  if (!config) return null;

  console.log(`  [IG] Scraping ${config.username}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(6000);

      // Check for login wall
      const loginWall = await page.$('input[name="username"]');
      if (loginWall) {
        console.log('  [IG] Login wall detected — using meta tags fallback');
        const metaResult = await scrapeFromMeta(page, config);
        // If meta tags also returned 0, try HTTP-only fallback
        if (!metaResult || metaResult.followers === 0) {
          const httpResult = await scrapeInstagramViaHttp(config);
          if (httpResult && httpResult.followers > 0) return httpResult;
        }
        return metaResult;
      }

      const metrics = await page.evaluate(() => {
        const getText = (el) => el?.textContent?.trim() || '0';

        // Try to extract from header stats
        const stats = document.querySelectorAll('header section ul li');
        const parseCount = (text) => {
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

        let posts = 0, followers = 0, following = 0;
        if (stats.length >= 3) {
          posts = parseCount(getText(stats[0]));
          followers = parseCount(getText(stats[1]));
          following = parseCount(getText(stats[2]));
        }

        // Get bio
        const bioEl = document.querySelector('header section > div > span');
        const bio = bioEl ? bioEl.textContent.trim() : '';

        // Get profile name
        const nameEl = document.querySelector('header section h2') ||
                       document.querySelector('header h1');
        const displayName = nameEl ? nameEl.textContent.trim() : '';

        return { posts, followers, following, bio, displayName };
      });

      // If Playwright DOM returned 0 followers, try HTTP fallback before giving up
      if (metrics.followers === 0) {
        console.log('  [IG] Playwright got 0 followers — trying HTTP fallback...');
        const httpResult = await scrapeInstagramViaHttp(config);
        if (httpResult && httpResult.followers > 0) {
          // Still try to get posts via Playwright if we got the profile page loaded
          const recentPosts = await scrapeRecentPosts(page).catch(() => []);
          httpResult.recentPosts = recentPosts.length > 0 ? recentPosts : [];
          return httpResult;
        }
      }

      // Scrape recent posts
      const recentPosts = await scrapeRecentPosts(page);

      return {
        platform: 'instagram',
        username: config.username,
        url: config.url,
        ...metrics,
        recentPosts,
        scrapedAt: new Date().toISOString(),
        success: true,
      };
    } catch (err) {
      console.log(`  [IG] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  // Final fallback: try HTTP-only before returning failure
  const httpResult = await scrapeInstagramViaHttp(config);
  if (httpResult && httpResult.followers > 0) return httpResult;

  return {
    platform: 'instagram',
    username: config.username,
    url: config.url,
    error: 'Failed after max retries',
    scrapedAt: new Date().toISOString(),
    success: false,
  };
}

async function scrapeFromMeta(page, config) {
  const metrics = await page.evaluate(() => {
    const getMetaContent = (property) => {
      const el = document.querySelector(`meta[property="${property}"]`) ||
                 document.querySelector(`meta[name="${property}"]`);
      return el ? el.getAttribute('content') : '';
    };

    const description = getMetaContent('og:description') ||
                       getMetaContent('description') || '';

    // Parse "123K Followers, 45 Following, 678 Posts"
    const parseCount = (text) => {
      const match = text.match(/([\d.]+)\s*(K|M|B)?/i);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const suffix = (match[2] || '').toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      return Math.round(num);
    };

    let followers = 0, following = 0, posts = 0;
    const followerMatch = description.match(/([\d.]+[KMB]?)\s*Followers/i);
    const followingMatch = description.match(/([\d.]+[KMB]?)\s*Following/i);
    const postsMatch = description.match(/([\d.]+[KMB]?)\s*Posts/i);

    if (followerMatch) followers = parseCount(followerMatch[1]);
    if (followingMatch) following = parseCount(followingMatch[1]);
    if (postsMatch) posts = parseCount(postsMatch[1]);

    const title = getMetaContent('og:title') || document.title;

    return { followers, following, posts, displayName: title, bio: description };
  });

  return {
    platform: 'instagram',
    username: config.username,
    url: config.url,
    ...metrics,
    recentPosts: [],
    scrapedAt: new Date().toISOString(),
    success: true,
    note: 'Scraped from meta tags (login wall)',
  };
}

async function scrapeRecentPosts(page) {
  try {
    // Step 1: Collect post URLs from profile grid
    const postLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('article a[href*="/p/"], a[href*="/reel/"]');
      return Array.from(links).slice(0, 12).map(el => {
        const href = el.getAttribute('href');
        const img = el.querySelector('img');
        return {
          url: href ? `https://www.instagram.com${href}` : '',
          thumbnail: img ? img.src : '',
          altText: img ? img.getAttribute('alt') : '',
        };
      });
    });

    // Step 2: Visit each post page and extract engagement from og:description
    // IG embeds "X likes, Y comments" in the meta description — works without login
    const posts = [];
    for (const link of postLinks) {
      if (!link.url) continue;
      try {
        await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500);

        const postData = await page.evaluate(() => {
          const ogDesc = document.querySelector('meta[property="og:description"]');
          const desc = ogDesc ? ogDesc.getAttribute('content') : '';
          const ogTitle = document.querySelector('meta[property="og:title"]');
          const title = ogTitle ? ogTitle.getAttribute('content') : '';

          // Parse "123 likes, 4 comments - username on Date: "caption""
          // Views on Reels may appear as "12.5K views" — handle K/M suffixes
          const parseEngNum = (s) => {
            if (!s) return null;
            const cleaned = s.replace(/,/g, '').trim();
            const m = cleaned.match(/([\d.]+)\s*(K|M|B)?/i);
            if (!m) return null;
            const num = parseFloat(m[1]);
            const suffix = (m[2] || '').toUpperCase();
            if (suffix === 'K') return Math.round(num * 1000);
            if (suffix === 'M') return Math.round(num * 1000000);
            if (suffix === 'B') return Math.round(num * 1000000000);
            return Math.round(num);
          };
          const likesMatch = desc.match(/([\d,.]+[KMB]?)\s*likes?/i);
          const commentsMatch = desc.match(/([\d,.]+[KMB]?)\s*comments?/i);
          const viewsMatch = desc.match(/([\d,.]+[KMB]?)\s*views?/i);

          // Extract date from desc: "username on April 5, 2026:"
          const dateMatch = desc.match(/on\s+(\w+\s+\d{1,2},?\s*\d{4})/i);

          // Extract caption from title: 'Name on Instagram: "caption"'
          const captionMatch = title.match(/:\s*"(.+)"/s);
          const caption = captionMatch ? captionMatch[1] : desc;

          // Detect post type from URL and content
          const url = window.location.href;
          let postType = 'Image';
          if (url.includes('/reel/')) postType = 'Reel';
          else if (viewsMatch) postType = 'Video';

          return {
            likes: likesMatch ? parseEngNum(likesMatch[1]) : null,
            comments: commentsMatch ? parseEngNum(commentsMatch[1]) : null,
            views: viewsMatch ? parseEngNum(viewsMatch[1]) : null,
            caption: caption || '',
            date: dateMatch ? dateMatch[1] : null,
            postType,
          };
        });

        posts.push({
          url: link.url,
          thumbnail: link.thumbnail,
          caption: postData.caption || link.altText,
          likes: postData.likes,
          comments: postData.comments,
          views: postData.views,
          date: postData.date,
          postType: postData.postType,
        });
      } catch {
        // If a post fails, still include it with basic info
        posts.push({
          url: link.url,
          thumbnail: link.thumbnail,
          caption: link.altText,
          likes: null,
          comments: null,
        });
      }
    }

    // Navigate back to profile for any further scraping
    return posts;
  } catch {
    return [];
  }
}

export { scrapeInstagram };
