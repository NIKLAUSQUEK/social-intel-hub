/**
 * LinkedIn profile/company scraper via Playwright
 * Extracts public data from meta tags and visible page content
 * No login required for basic metrics (followers, headline, etc.)
 */

/**
 * Scrape a LinkedIn personal profile
 */
export async function scrapeLinkedIn(page, client) {
  const config = client.platforms?.linkedin;
  if (!config) return null;

  console.log(`  [LI] Scraping LinkedIn profile: ${config.url}`);

  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const data = await page.evaluate(() => {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      const ogImage = document.querySelector('meta[property="og:image"]');
      const title = ogTitle ? ogTitle.getAttribute('content') : '';
      const desc = ogDesc ? ogDesc.getAttribute('content') : '';
      const avatar = ogImage ? ogImage.getAttribute('content') : '';

      const pageText = document.body?.innerText || '';

      // Extract follower count
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
        bio: desc.slice(0, 500),
      };
    });

    // Try to scrape recent activity/posts
    const recentPosts = await page.evaluate(() => {
      const postEls = document.querySelectorAll('[data-urn*="activity"], .feed-shared-update-v2, .occludable-update, .pv-recent-activity-section__card-container');
      return Array.from(postEls).slice(0, 6).map(el => {
        const text = el.innerText?.trim() || '';
        if (text.length < 20) return null;
        const likesMatch = text.match(/([\d,]+)\s*(?:likes?|reactions?)/i);
        const commentsMatch = text.match(/([\d,]+)\s*comments?/i);
        const parseNum = (s) => s ? parseInt(s.replace(/,/g, ''), 10) : 0;

        // Try to get post link
        const link = el.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
        const postUrl = link ? link.getAttribute('href') : '';

        return {
          url: postUrl.startsWith('http') ? postUrl : (postUrl ? 'https://www.linkedin.com' + postUrl : ''),
          text: text.slice(0, 200),
          likes: parseNum(likesMatch?.[1]),
          comments: parseNum(commentsMatch?.[1]),
          postType: 'Post',
          platform: 'linkedin',
        };
      }).filter(Boolean);
    });

    const result = {
      platform: 'linkedin',
      url: config.url,
      username: config.username || '',
      displayName: data.name,
      headline: data.headline,
      avatar: data.avatar,
      followers: data.followers,
      connections: data.connections,
      bio: data.bio,
      recentPosts,
      avgEngagement: recentPosts.length > 0
        ? Math.round(recentPosts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0), 0) / recentPosts.length)
        : 0,
      success: data.followers > 0 || data.name.length > 0,
      scrapedAt: new Date().toISOString(),
      source: 'playwright',
    };

    console.log(`  [LI] ${data.name} — ${data.followers} followers, ${recentPosts.length} posts`);
    return result;
  } catch (err) {
    console.log(`  [LI] Scrape failed: ${err.message}`);
    return { platform: 'linkedin', success: false, error: err.message };
  }
}

/**
 * Scrape a LinkedIn company page
 */
export async function scrapeLinkedInCompany(page, url) {
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
        description: desc.slice(0, 500),
        avatar: avatar || '',
        followers: parseNum(followersMatch?.[1]),
        employees: parseNum(employeesMatch?.[1]),
      };
    });

    console.log(`  [LI] Company: ${data.name} — ${data.followers} followers`);

    return {
      platform: 'linkedin',
      url,
      ...data,
      recentPosts: [],
      avgEngagement: 0,
      success: data.followers > 0 || data.name.length > 0,
      scrapedAt: new Date().toISOString(),
      source: 'playwright',
    };
  } catch (err) {
    console.log(`  [LI] Company scrape failed: ${err.message}`);
    return { platform: 'linkedin', url, success: false, error: err.message };
  }
}
