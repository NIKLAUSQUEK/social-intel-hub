/**
 * Facebook scraper — pulls public page metrics and recent posts
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeFacebook(page, client) {
  const config = client.platforms.facebook;
  if (!config) return null;

  console.log(`  [FB] Scraping ${config.username}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check for login wall
      const loginForm = await page.$('#login_form, [data-testid="royal_login_form"]');
      if (loginForm) {
        console.log('  [FB] Login wall detected — trying meta tags fallback');
        return await scrapeFromMeta(page, config);
      }

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

        // Try to find follower/like counts
        let followers = 0, pageLikes = 0;

        // Search all text nodes for follower/like patterns
        const allText = document.body.innerText;

        const followerPatterns = [
          /([\d,.]+[KMB]?)\s*(?:people follow|followers)/i,
          /(?:followed by|followers:?)\s*([\d,.]+[KMB]?)/i,
        ];

        const likePatterns = [
          /([\d,.]+[KMB]?)\s*(?:people like|total likes|likes)/i,
          /(?:liked by|likes:?)\s*([\d,.]+[KMB]?)/i,
        ];

        for (const pattern of followerPatterns) {
          const match = allText.match(pattern);
          if (match) {
            followers = parseCount(match[1]);
            break;
          }
        }

        for (const pattern of likePatterns) {
          const match = allText.match(pattern);
          if (match) {
            pageLikes = parseCount(match[1]);
            break;
          }
        }

        // Page name
        const nameEl = document.querySelector('h1') || document.querySelector('[role="heading"]');
        const displayName = nameEl ? nameEl.textContent.trim() : '';

        // Category
        const categoryLinks = document.querySelectorAll('a[href*="/pages/category/"]');
        const category = categoryLinks.length > 0 ? categoryLinks[0].textContent.trim() : '';

        return { followers, pageLikes, displayName, category };
      });

      // Scrape recent posts
      const recentPosts = await scrapeRecentPosts(page);

      return {
        platform: 'facebook',
        username: config.username,
        url: config.url,
        ...metrics,
        recentPosts,
        scrapedAt: new Date().toISOString(),
        success: true,
      };
    } catch (err) {
      console.log(`  [FB] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  return {
    platform: 'facebook',
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
    const title = getMetaContent('og:title') || document.title;

    const parseCount = (text) => {
      const match = text.match(/([\d,.]+[KMB]?)/i);
      if (!match) return 0;
      const cleaned = match[1].replace(/,/g, '');
      const numMatch = cleaned.match(/([\d.]+)\s*(K|M|B)?/i);
      if (!numMatch) return 0;
      const num = parseFloat(numMatch[1]);
      const suffix = (numMatch[2] || '').toUpperCase();
      if (suffix === 'K') return Math.round(num * 1000);
      if (suffix === 'M') return Math.round(num * 1000000);
      return Math.round(num);
    };

    const followerMatch = description.match(/([\d,.]+[KMB]?)\s*(?:followers|people follow)/i);
    const likesMatch = description.match(/([\d,.]+[KMB]?)\s*(?:likes|people like)/i);

    return {
      followers: followerMatch ? parseCount(followerMatch[1]) : 0,
      pageLikes: likesMatch ? parseCount(likesMatch[1]) : 0,
      displayName: title,
      category: '',
    };
  });

  return {
    platform: 'facebook',
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
    // Scroll to load posts
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(2000);

    const posts = await page.evaluate(() => {
      const postElements = document.querySelectorAll('[role="article"], .userContentWrapper');
      const results = [];

      for (let i = 0; i < Math.min(12, postElements.length); i++) {
        const el = postElements[i];

        // Get post text
        const textEl = el.querySelector('[data-ad-preview="message"], [data-testid="post_message"]');
        const caption = textEl ? textEl.textContent.trim().slice(0, 300) : '';

        // Get link
        const linkEl = el.querySelector('a[href*="/posts/"], a[href*="/photo"]');
        const url = linkEl ? linkEl.href : '';

        // Try to get reaction count
        const reactionEl = el.querySelector('[aria-label*="reaction"], [aria-label*="like"]');
        const reactionText = reactionEl ? reactionEl.getAttribute('aria-label') : '';
        const reactionsMatch = reactionText.match(/([\d,]+)/);
        const reactions = reactionsMatch ? parseInt(reactionsMatch[1].replace(/,/g, '')) : null;

        // Comments count
        const commentEl = el.querySelector('[aria-label*="comment"]');
        const commentText = commentEl ? commentEl.textContent : '';
        const commentsMatch = commentText.match(/([\d,]+)/);
        const comments = commentsMatch ? parseInt(commentsMatch[1].replace(/,/g, '')) : null;

        // Shares
        const shareEl = el.querySelector('[aria-label*="share"]');
        const shareText = shareEl ? shareEl.textContent : '';
        const sharesMatch = shareText.match(/([\d,]+)/);
        const shares = sharesMatch ? parseInt(sharesMatch[1].replace(/,/g, '')) : null;

        if (caption || url) {
          results.push({ url, caption, reactions, comments, shares });
        }
      }

      return results;
    });

    return posts;
  } catch {
    return [];
  }
}

export { scrapeFacebook };
