/**
 * Format inference — normalise post type across platforms
 *
 * Current scraper lumps all IG as "Reel" and all TikTok as "Video", losing
 * static/carousel/story differentiation. This helper uses URL patterns,
 * duration, caption hints and thumbnail count to infer true format so the
 * brand report can break down performance by format and surface alpha posts
 * to repurpose.
 *
 * Returns one of a fixed vocabulary:
 *   ig-reel | ig-static | ig-carousel | ig-story | ig-igtv
 *   tt-video | tt-photo-carousel | tt-live
 *   li-post | li-article | li-carousel | li-video | li-poll
 *   fb-post | fb-photo | fb-video | fb-reel | fb-story
 *   other
 */

export function inferFormat(post) {
  const platform = (post.platform || '').toLowerCase();
  const url = (post.url || '').toLowerCase();
  const rawType = (post.postType || post.type || post.media_type || '').toLowerCase();
  const productType = (post.media_product_type || '').toLowerCase();
  const duration = post.duration || 0;
  const thumbs = (post.thumbnails || post.images || []).length;
  const caption = (post.caption || '').toLowerCase();

  // ── Instagram ──
  if (platform === 'instagram' || url.includes('instagram.com')) {
    // Meta Graph API returns media_product_type = FEED | REEL | STORY
    if (productType === 'reel' || url.includes('/reel/') || rawType === 'reel') return 'ig-reel';
    if (productType === 'story' || url.includes('/stories/')) return 'ig-story';
    if (url.includes('/tv/') || rawType === 'igtv') return 'ig-igtv';
    // Meta Graph API returns media_type = IMAGE | VIDEO | CAROUSEL_ALBUM
    if (rawType === 'carousel_album' || rawType === 'carousel' || thumbs > 1) return 'ig-carousel';
    if (rawType === 'video') return 'ig-reel'; // standalone /p/ videos → treat as reel equivalent
    if (rawType === 'image' || rawType === 'photo') return 'ig-static';
    // Fallback: /p/ URL without clear signal → static image
    if (url.includes('/p/')) return 'ig-static';
    return 'ig-reel'; // safe default
  }

  // ── TikTok ──
  if (platform === 'tiktok' || url.includes('tiktok.com')) {
    if (url.includes('/photo/') || rawType === 'photo') return 'tt-photo-carousel';
    if (rawType === 'live' || url.includes('/live/')) return 'tt-live';
    return 'tt-video';
  }

  // ── LinkedIn ──
  if (platform === 'linkedin' || url.includes('linkedin.com')) {
    if (rawType === 'article' || url.includes('/pulse/')) return 'li-article';
    if (rawType === 'carousel' || /carousel|slide/.test(caption)) return 'li-carousel';
    if (rawType === 'video' || url.includes('/videos/')) return 'li-video';
    if (rawType === 'poll' || /🗳️|poll|vote/.test(caption)) return 'li-poll';
    return 'li-post';
  }

  // ── Facebook ──
  if (platform === 'facebook' || url.includes('facebook.com')) {
    if (url.includes('/reel/') || rawType === 'reel') return 'fb-reel';
    if (url.includes('/videos/') || rawType === 'video') return 'fb-video';
    if (url.includes('/photos/') || rawType === 'photo') return 'fb-photo';
    if (url.includes('/stories/')) return 'fb-story';
    return 'fb-post';
  }

  return 'other';
}

export function formatLabel(fmt) {
  return {
    'ig-reel': 'Instagram Reel',
    'ig-static': 'Instagram Static',
    'ig-carousel': 'Instagram Carousel',
    'ig-story': 'Instagram Story',
    'ig-igtv': 'IGTV',
    'tt-video': 'TikTok Video',
    'tt-photo-carousel': 'TikTok Photo Carousel',
    'tt-live': 'TikTok Live',
    'li-post': 'LinkedIn Post',
    'li-article': 'LinkedIn Article',
    'li-carousel': 'LinkedIn Carousel',
    'li-video': 'LinkedIn Video',
    'li-poll': 'LinkedIn Poll',
    'fb-post': 'Facebook Post',
    'fb-photo': 'Facebook Photo',
    'fb-video': 'Facebook Video',
    'fb-reel': 'Facebook Reel',
    'fb-story': 'Facebook Story',
    'other': 'Other',
  }[fmt] || fmt;
}

/**
 * Build format-aware performance breakdown for the brand report prompt.
 * Returns an object with:
 *   byFormat: { [fmt]: { count, avgViews, avgLikes, avgComments, avgEngagement, topPost } }
 *   alphas: array of top 10 posts globally (by weighted engagement) with format
 *   series: detected repeating patterns (same format × same classification × sustained performance)
 */
export function analyseFormatPerformance(posts, classifications = []) {
  const classByUrl = {};
  for (const c of classifications) classByUrl[c.post_id || c.url] = c;

  const enriched = posts.map(p => {
    const format = inferFormat(p);
    const cls = classByUrl[p.url] || {};
    const views = p.views || 0;
    const likes = p.likes || 0;
    const comments = p.comments || 0;
    const shares = p.shares || 0;
    const engagement = views + likes * 5 + comments * 10 + shares * 15;
    return {
      ...p,
      format,
      formatLabel: formatLabel(format),
      contentType: cls.content_type || null,
      hookType: cls.hook_type || null,
      sentimentScore: cls.sentiment_score || null,
      engagement,
      views, likes, comments, shares,
    };
  });

  // ── Per-format aggregates ──
  const byFormat = {};
  for (const p of enriched) {
    const k = p.format;
    if (!byFormat[k]) byFormat[k] = { count: 0, views: 0, likes: 0, comments: 0, shares: 0, posts: [] };
    const g = byFormat[k];
    g.count++;
    g.views += p.views;
    g.likes += p.likes;
    g.comments += p.comments;
    g.shares += p.shares;
    g.posts.push(p);
  }
  for (const k of Object.keys(byFormat)) {
    const g = byFormat[k];
    g.label = formatLabel(k);
    g.avgViews = Math.round(g.views / g.count);
    g.avgLikes = Math.round(g.likes / g.count);
    g.avgComments = Math.round(g.comments / g.count);
    g.avgShares = Math.round(g.shares / g.count);
    g.avgEngagement = Math.round((g.views + g.likes * 5 + g.comments * 10 + g.shares * 15) / g.count);
    g.posts.sort((a, b) => b.engagement - a.engagement);
    g.top3 = g.posts.slice(0, 3).map(p => ({
      url: p.url,
      caption: (p.caption || '').slice(0, 140),
      views: p.views, likes: p.likes, comments: p.comments,
      engagement: p.engagement,
      hookType: p.hookType,
      contentType: p.contentType,
      date: p.date,
    }));
    g.posts = undefined; // don't ship full list to prompt
  }

  // ── Alpha posts — top 10 globally, weighted by (engagement × recency decay) ──
  const now = Date.now();
  const scored = enriched.map(p => {
    const ageDays = p.date ? (now - new Date(p.date).getTime()) / 86400000 : 999;
    const recency = Math.max(0.3, 1 - ageDays / 180); // decays linearly over 6 months, floor 0.3
    return { ...p, alphaScore: p.engagement * recency };
  });
  scored.sort((a, b) => b.alphaScore - a.alphaScore);
  const alphas = scored.slice(0, 10).map(p => ({
    url: p.url,
    platform: p.platform,
    format: p.format,
    formatLabel: p.formatLabel,
    caption: (p.caption || '').slice(0, 160),
    date: p.date,
    views: p.views, likes: p.likes, comments: p.comments,
    engagement: p.engagement,
    contentType: p.contentType,
    hookType: p.hookType,
    whyAlpha: p.alphaScore > 0 ? `${p.engagement.toLocaleString()} weighted engagement · ${p.formatLabel}` : null,
  }));

  // ── Series signals — group by format + contentType / hookType ──
  const seriesBuckets = {};
  for (const p of enriched) {
    if (p.engagement === 0) continue;
    const signal = p.contentType || p.hookType;
    if (!signal) continue;
    const key = `${p.format}::${signal}`;
    if (!seriesBuckets[key]) seriesBuckets[key] = { format: p.format, formatLabel: p.formatLabel, signal, posts: [] };
    seriesBuckets[key].posts.push(p);
  }
  const series = Object.values(seriesBuckets)
    .filter(b => b.posts.length >= 2)
    .map(b => {
      b.posts.sort((a, c) => c.engagement - a.engagement);
      const avgEng = Math.round(b.posts.reduce((s, p) => s + p.engagement, 0) / b.posts.length);
      return {
        format: b.format,
        formatLabel: b.formatLabel,
        signal: b.signal,
        postCount: b.posts.length,
        avgEngagement: avgEng,
        sampleCaptions: b.posts.slice(0, 3).map(p => (p.caption || '').slice(0, 100)),
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  return {
    byFormat,
    alphas,
    series,
    totalPosts: enriched.length,
    formatsCount: Object.keys(byFormat).length,
  };
}
