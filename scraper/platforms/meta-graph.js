/**
 * Meta Graph API — Instagram business_discovery scraper
 *
 * FREE unlimited scraping of ANY Instagram Business or Creator account
 * once you have a Page Access Token linked to your own IG Business Account.
 *
 * Required env vars (.env.local):
 *   META_IG_BUSINESS_ID       — your OWN IG Business Account ID (host for queries)
 *   META_PAGE_ACCESS_TOKEN    — page access token with instagram_basic scope
 *   META_APP_ID               — from app.meta.com
 *   META_APP_SECRET           — from app.meta.com
 *
 * How to obtain credentials: see scraper/platforms/META_SETUP.md
 *
 * What this endpoint returns:
 *   - Profile: username, followers_count, follows_count, media_count,
 *     biography, website, profile_picture_url
 *   - Media (latest ~25 posts): id, caption, media_type, permalink,
 *     timestamp, like_count, comments_count
 *
 * What it does NOT return:
 *   - Actual comments (still need Apify / SocialKit for comment text)
 *   - Stories or Reels separately (lumped into media)
 *   - Audience demographics (requires instagram_manage_insights scope)
 */

const BASE = 'https://graph.facebook.com/v21.0';

function creds() {
  const igId = process.env.META_IG_BUSINESS_ID;
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!igId || !token) {
    throw new Error('META_IG_BUSINESS_ID / META_PAGE_ACCESS_TOKEN not set — Meta scraper unavailable');
  }
  return { igId, token };
}

export function isMetaAvailable() {
  return !!(process.env.META_IG_BUSINESS_ID && process.env.META_PAGE_ACCESS_TOKEN);
}

async function graph(path, params = {}) {
  const { token } = creds();
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({ error: { message: 'unparseable body' } }));
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta Graph ${path}: ${msg}`);
  }
  return json;
}

// ── Probe: confirm creds are live ──────────────────

export async function pingMeta() {
  const { igId } = creds();
  const me = await graph(`/${igId}`, { fields: 'username,followers_count,media_count' });
  return {
    ok: true,
    ig_business_account: me.username,
    followers: me.followers_count,
    mediaCount: me.media_count,
  };
}

// ── Public: scrape an IG account's profile + recent media ──

export async function scrapeIGViaMeta(targetUsername) {
  if (!targetUsername) throw new Error('targetUsername required');
  const { igId } = creds();

  // business_discovery returns profile + up to 25 most-recent media items in one call
  const fields = [
    'business_discovery.username(' + targetUsername + '){',
    'username,name,biography,website,profile_picture_url,',
    'followers_count,follows_count,media_count,',
    'media.limit(25){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}',
    '}',
  ].join('');

  let data;
  try {
    data = await graph(`/${igId}`, { fields });
  } catch (err) {
    // Common errors:
    //   (110) Target user is private → we can't see them
    //   (24)  User is not IG Business/Creator → business_discovery won't work for personal accounts
    //   (190) Token expired
    return {
      platform: 'instagram',
      username: targetUsername,
      success: false,
      error: err.message,
      source: 'meta',
    };
  }

  const bd = data.business_discovery || {};
  const media = (bd.media?.data || []).map(m => ({
    url: m.permalink,
    postId: m.id,
    caption: m.caption || '',
    type: m.media_type,                    // IMAGE | VIDEO | CAROUSEL_ALBUM
    productType: m.media_product_type,     // FEED | REEL | STORY
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    date: m.timestamp,
  }));

  return {
    platform: 'instagram',
    username: bd.username || targetUsername,
    displayName: bd.name || '',
    bio: bd.biography || '',
    website: bd.website || '',
    avatar: bd.profile_picture_url || '',
    followers: bd.followers_count ?? 0,
    following: bd.follows_count ?? 0,
    posts: bd.media_count ?? media.length,
    recentPosts: media,
    scrapedAt: new Date().toISOString(),
    success: true,
    source: 'meta',
  };
}

// ── Token hygiene ──────────────────────────────────

/**
 * Convert a short-lived Page Access Token into a long-lived one (60 days).
 * Run this once after generating a token in Graph API Explorer.
 */
export async function extendPageToken(shortLivedPageToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('META_APP_ID / META_APP_SECRET not set');

  // Step 1: user token → long-lived user token
  // (Graph API nuance: long-lived USER tokens are 60-day, derived Page tokens inherit that.)
  const url = new URL(`${BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedPageToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || 'token extend failed');
  return json; // { access_token, token_type, expires_in }
}
