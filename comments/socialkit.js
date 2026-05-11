/**
 * SocialKit comment scraper
 *
 * Supports:
 *   TikTok comments  — /tiktok/comments   ✓ verified working
 *   YouTube comments — /youtube/comments  (if any clients have YouTube)
 *   Instagram       — NOT SUPPORTED by SocialKit (no endpoint exists)
 *
 * Uses user's existing SOCIALKIT_API_KEY (they have credits).
 *
 * Response shape (verified April 2026):
 *   { success: true, data: {
 *       url, videoId,
 *       comments: [{ id, author, text, likes, date, replyCount, username, ... }],
 *       hasMore, cursor
 *   }}
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SK_BASE = 'https://api.socialkit.dev';
const USAGE_FILE = join(__dirname, '..', 'logs', 'socialkit-usage.json');
if (!existsSync(dirname(USAGE_FILE))) mkdirSync(dirname(USAGE_FILE), { recursive: true });

function getKey() {
  const k = process.env.SOCIALKIT_API_KEY;
  if (!k) throw new Error('SOCIALKIT_API_KEY not set');
  return k;
}

// ── Credit tracking ────────────────────────────────

function loadUsage() {
  if (!existsSync(USAGE_FILE)) return { creditsUsed: 0, calls: 0, resetAt: null };
  try { return JSON.parse(readFileSync(USAGE_FILE, 'utf-8')); }
  catch { return { creditsUsed: 0, calls: 0, resetAt: null }; }
}

function saveUsage(u) {
  writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
}

export function getSocialKitUsage() {
  const cap = parseInt(process.env.SOCIALKIT_CREDIT_CAP || '720', 10);
  const u = loadUsage();
  return { ...u, cap, remaining: Math.max(0, cap - u.creditsUsed) };
}

export function resetSocialKitUsage() {
  saveUsage({ creditsUsed: 0, calls: 0, resetAt: new Date().toISOString() });
}

function capExceeded() {
  const { remaining } = getSocialKitUsage();
  return remaining <= 0;
}

function recordCall(credits = 1, endpoint = '') {
  const u = loadUsage();
  u.creditsUsed = (u.creditsUsed || 0) + credits;
  u.calls = (u.calls || 0) + 1;
  u.lastCall = new Date().toISOString();
  u.lastEndpoint = endpoint;
  saveUsage(u);
  return u;
}

async function skGet(path, params) {
  // Credit cap check — refuse call if cap reached so Apify fallback can take over
  if (capExceeded()) {
    const u = getSocialKitUsage();
    throw new Error(`SocialKit credit cap reached: ${u.creditsUsed}/${u.cap} used`);
  }

  const url = new URL(`${SK_BASE}${path}`);
  url.searchParams.set('access_key', getKey());
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });

  // Count every API call regardless of success — SocialKit charges per call attempt
  recordCall(1, path);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SocialKit ${path} ${res.status}: ${body.slice(0, 160)}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`SocialKit ${path} !success: ${JSON.stringify(json).slice(0, 160)}`);
  return json.data;
}

// ── TikTok ─────────────────────────────────────────

export async function scrapeTikTokCommentsViaSocialKit(videoUrls, limitPerVideo = 200) {
  const all = [];
  for (const url of videoUrls) {
    try {
      // Paginate through SocialKit's cursor-based results until hasMore=false or cap reached
      let cursor = null;
      let pageCount = 0;
      let totalForVideo = 0;
      const MAX_PAGES = Math.ceil(limitPerVideo / 10); // SK returns ~10/page
      do {
        const params = { url };
        if (cursor != null) params.cursor = String(cursor);
        const data = await skGet('/tiktok/comments', params);
        const list = data?.comments || [];
        for (const c of list) {
          all.push({
            platform: 'tiktok',
            postUrl: url,
            commentId: c.id || '',
            text: c.text || '',
            likes: c.likes || 0,
            timestamp: c.date || null,
            author: c.username || c.author || '',
            repliesCount: c.replyCount || 0,
            source: 'socialkit',
          });
          totalForVideo++;
        }
        cursor = data?.hasMore ? data.cursor : null;
        pageCount++;
        if (totalForVideo >= limitPerVideo) break;
      } while (cursor != null && pageCount < MAX_PAGES);
    } catch (err) {
      console.log(`  [SK-TT-comments] ${url.slice(-30)}: ${err.message.slice(0, 80)}`);
    }
  }
  return all.filter(c => c.text);
}

// ── YouTube (bonus, if we ever add YT clients) ─────

export async function scrapeYouTubeCommentsViaSocialKit(videoUrls) {
  const all = [];
  for (const url of videoUrls) {
    try {
      const data = await skGet('/youtube/comments', { url });
      const list = data?.comments || [];
      for (const c of list) {
        all.push({
          platform: 'youtube',
          postUrl: url,
          commentId: c.id || '',
          text: c.text || c.comment || '',
          likes: c.likeCount || c.likes || 0,
          timestamp: c.publishedAt || null,
          author: c.author || c.authorDisplayName || '',
          source: 'socialkit',
        });
      }
    } catch (err) {
      console.log(`  [SK-YT-comments] ${url.slice(-30)}: ${err.message.slice(0, 80)}`);
    }
  }
  return all.filter(c => c.text);
}

// ── Cost estimator ─────────────────────────────────
// SocialKit credits approx (user confirmed they have credits)
export function estimateSocialKitCost(ttCommentCalls) {
  // ~$0.003 per TikTok comment fetch (1 API call per video, multi-comment response)
  return ttCommentCalls * 0.003;
}
