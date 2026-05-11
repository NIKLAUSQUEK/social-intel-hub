/**
 * Wayback Machine historical lookup — fetches archived snapshots
 * of social profiles from the last 2 months
 */

import fetch from 'node-fetch';

const WAYBACK_API = 'https://web.archive.org/web';
const CDX_API = 'https://web.archive.org/cdx/search/cdx';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get available Wayback snapshots for a URL within a date range
 */
async function getSnapshots(url, fromDate, toDate) {
  const params = new URLSearchParams({
    url,
    output: 'json',
    from: fromDate,
    to: toDate,
    fl: 'timestamp,statuscode,original',
    filter: 'statuscode:200',
    collapse: 'timestamp:8', // One per day
    limit: '60',
  });

  try {
    const response = await fetch(`${CDX_API}?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data || data.length <= 1) return []; // First row is headers

    // Skip header row
    return data.slice(1).map((row) => ({
      timestamp: row[0],
      date: `${row[0].slice(0, 4)}-${row[0].slice(4, 6)}-${row[0].slice(6, 8)}`,
      url: `${WAYBACK_API}/${row[0]}/${row[2]}`,
    }));
  } catch (err) {
    console.log(`  [WB] CDX API error for ${url}: ${err.message}`);
    return [];
  }
}

/**
 * Attempt to extract metrics from a Wayback snapshot
 */
async function extractMetricsFromSnapshot(page, snapshotUrl, platform) {
  try {
    await page.goto(snapshotUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    const metrics = await page.evaluate((plat) => {
      const parseCount = (text) => {
        if (!text) return 0;
        const match = text.match(/([\d,.]+)\s*(K|M|B)?/i);
        if (!match) return 0;
        const num = parseFloat(match[1].replace(/,/g, ''));
        const suffix = (match[2] || '').toUpperCase();
        if (suffix === 'K') return Math.round(num * 1000);
        if (suffix === 'M') return Math.round(num * 1000000);
        return Math.round(num);
      };

      const getMetaContent = (property) => {
        const el = document.querySelector(`meta[property="${property}"]`) ||
                   document.querySelector(`meta[name="${property}"]`);
        return el ? el.getAttribute('content') : '';
      };

      const description = getMetaContent('og:description') ||
                         getMetaContent('description') ||
                         document.body?.innerText?.slice(0, 2000) || '';

      let followers = 0;

      if (plat === 'instagram') {
        const match = description.match(/([\d,.]+[KMB]?)\s*Followers/i);
        if (match) followers = parseCount(match[1]);
      } else if (plat === 'tiktok') {
        const match = description.match(/([\d,.]+[KMB]?)\s*Followers/i);
        if (match) followers = parseCount(match[1]);
      } else if (plat === 'facebook') {
        const match = description.match(/([\d,.]+[KMB]?)\s*(?:followers|people follow)/i);
        if (match) followers = parseCount(match[1]);
      }

      return { followers };
    }, platform);

    return metrics;
  } catch {
    return null;
  }
}

/**
 * Fetch historical data for all platforms of a client
 */
async function scrapeWayback(page, client) {
  console.log(`  [WB] Looking up Wayback Machine archives for ${client.name}...`);

  const now = new Date();
  const twoMonthsAgo = new Date(now);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const toDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const fromDate = twoMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '');

  const history = {};

  for (const [platform, config] of Object.entries(client.platforms)) {
    if (!config) continue;

    console.log(`  [WB] Checking ${platform} archives...`);
    const snapshots = await getSnapshots(config.url, fromDate, toDate);

    if (snapshots.length === 0) {
      console.log(`  [WB] No ${platform} snapshots found`);
      history[platform] = [];
      continue;
    }

    console.log(`  [WB] Found ${snapshots.length} ${platform} snapshots`);

    // Sample up to 8 snapshots evenly
    const sampled = sampleEvenly(snapshots, 8);
    const dataPoints = [];

    for (const snapshot of sampled) {
      const metrics = await extractMetricsFromSnapshot(page, snapshot.url, platform);
      if (metrics && metrics.followers > 0) {
        dataPoints.push({
          date: snapshot.date,
          ...metrics,
        });
      }
      await sleep(1500); // Be polite to Wayback
    }

    history[platform] = dataPoints;
    console.log(`  [WB] Extracted ${dataPoints.length} historical data points for ${platform}`);
  }

  return {
    clientId: client.id,
    history,
    scrapedAt: new Date().toISOString(),
  };
}

function sampleEvenly(arr, count) {
  if (arr.length <= count) return arr;
  const step = (arr.length - 1) / (count - 1);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

export { scrapeWayback };
