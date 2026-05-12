/**
 * Additional dashboard tabs — Data Hub, Content Library, Scorecard, Strategy & Tasks
 * Loaded by index.html as a module
 *
 * Design system: Clean white SaaS — #F8FAFC page bg, white cards, DM Sans font
 */

// ─── HTML escaping — prevents XSS from API/scraped data ──────────
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Safe URL — only allow http(s) protocols
function safeHref(url) {
  if (!url) return '#';
  var s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return '#';
}
window._esc = esc;
window._safeHref = safeHref;

// ─── Shared helpers (same as index.html) ──────────
function fmt(n) {
  if (n == null || n === 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function engScore(p) {
  return (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
}
const platformIcons = { instagram: '📸', tiktok: '🎵', facebook: '👥', linkedin: '💼' };
const platformColors = { instagram: '#E4405F', tiktok: '#000000', facebook: '#1877F2', linkedin: '#0A66C2' };

// ─── Design system constants ──────────
const DS = {
  card: 'background:#FFFFFF; border:1px solid #F1F5F9; border-radius:16px; padding:20px 22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);',
  sectionTitle: 'font-size:16px; font-weight:700; color:#1E293B; margin-bottom:12px;',
  muted: 'font-size:12px; color:#94A3B8;',
  metricValue: 'font-size:28px; font-weight:700; color:#1E293B; letter-spacing:-0.02em;',
  label: 'font-size:11px; font-weight:600; color:#94A3B8; text-transform:uppercase; letter-spacing:0.06em;',
  greenDelta: 'color:#22C55E; background:rgba(34,197,94,0.1); padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; display:inline-block;',
  redDelta: 'color:#EF4444; background:rgba(239,68,68,0.1); padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; display:inline-block;',
  grayDelta: 'color:#94A3B8; background:rgba(148,163,184,0.1); padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; display:inline-block;',
  th: 'text-align:left; padding:10px 14px; font-size:11px; font-weight:600; color:#94A3B8; text-transform:uppercase; letter-spacing:0.04em; background:#F8FAFC; border-bottom:1px solid #F1F5F9;',
  td: 'padding:10px 14px; border-bottom:1px solid #F1F5F9; font-size:13px; color:#475569;',
  tdHighlight: 'padding:10px 14px; border-bottom:1px solid #F1F5F9; font-size:13px; color:#475569; background:#F0EDFF;',
  btnPrimary: 'padding:10px 22px; border-radius:12px; background:#7C5CFC; color:#fff; font-size:13px; font-weight:700; border:none; box-shadow:0 2px 8px rgba(124,92,252,0.25); cursor:pointer;',
  btnSecondary: 'padding:10px 22px; border-radius:12px; background:#fff; color:#475569; font-size:13px; font-weight:600; border:1px solid #E2E8F0; cursor:pointer;',
  input: 'background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:8px 12px; color:#1E293B; font-size:14px; font-family:inherit;',
  select: 'background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:6px 10px; color:#475569; font-size:12px; cursor:pointer; font-family:inherit;',
  brand: '#7C5CFC',
};

// ─── A12: Percentile + stats helpers (vs trailing window) ──────────
// `computePercentile(value, series)` → 0–100 rank of value within sorted series.
// `percentileBadge(pct)` → coloured pill HTML for the dashboard.
// `meanStdev(arr)` → {mean, sd, n} for spike detection (A9).
function computePercentile(value, series) {
  if (value == null || !Array.isArray(series) || series.length === 0) return null;
  const vals = series.filter(v => v != null && !isNaN(v)).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  let below = 0;
  for (const v of vals) { if (v < value) below++; }
  return Math.round((below / vals.length) * 100);
}
function percentileBadge(pct, opts) {
  if (pct == null) return '';
  const o = opts || {};
  const label = o.label || (pct >= 90 ? 'Top 10%' : pct >= 75 ? 'Top 25%' : pct >= 50 ? 'Above median' : pct >= 25 ? 'Below median' : 'Bottom 25%');
  const colour = pct >= 75 ? '#22C55E' : pct >= 50 ? '#3B82F6' : pct >= 25 ? '#F59E0B' : '#EF4444';
  const bg = colour + '15';
  return '<span title="Ranked vs ' + (o.context || 'trailing 90 days') + '" style="display:inline-block; font-size:10px; font-weight:600; color:' + colour + '; background:' + bg + '; padding:1px 6px; border-radius:4px; margin-top:4px;">' + label + ' (' + pct + 'th)</span>';
}
function meanStdev(arr) {
  const vals = (arr || []).filter(v => v != null && !isNaN(v));
  const n = vals.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}
window.computePercentile = computePercentile;
window.percentileBadge = percentileBadge;
window.meanStdev = meanStdev;

// ─── Sparkline SVG helper ──────────
function sparklineSvg(data, color, w, h) {
  w = w || 90; h = h || 28;
  if (!data || data.length < 2) return '';
  var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), rng = mx - mn || 1;
  var pts = data.map(function(v, i) {
    return ((i / (data.length - 1)) * w) + ',' + (h - 2 - ((v - mn) / rng) * (h - 4));
  }).join(' ');
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>';
}

// ─── Date normalisation helper ──────────
function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  // "April 6, 2026" or "March 31, 2026"
  try {
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (e) { /* ignore */ }
  return null;
}
function getMonthKey(dateStr) {
  var d = normalizeDate(dateStr);
  return d ? d.slice(0, 7) : null;
}
function monthLabel(monthKey) {
  if (!monthKey) return '';
  var parts = monthKey.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}

// ─── Chart-specific number formatter (never returns '—') ──────────
function chartFmt(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  if (n === Math.floor(n)) return n.toLocaleString();
  return n.toFixed(1);
}

// ─── Full time-series chart SVG ──────────
function buildTimeSeriesChart(series, options) {
  var opts = Object.assign({
    width: 600, height: 200, color: DS.brand, fillColor: null,
    label: '', chartType: 'line', markers: [], yFormat: chartFmt,
    barColor: null
  }, options || {});

  if (!series || series.length < 2) {
    return '<div style="' + DS.muted + '; padding:20px; text-align:center; font-size:12px;">Not enough data points for chart</div>';
  }

  var W = opts.width, H = opts.height;
  var padL = 60, padR = 15, padT = 20, padB = 40;
  var chartW = W - padL - padR, chartH = H - padT - padB;

  var vals = series.map(function(s) { return s.value; });
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  var rng = mx - mn;

  // Smart Y-axis range: bar charts always start from 0; line charts use data-driven min
  if (opts.chartType === 'bar') {
    // Bar charts: start from 0 so bars represent absolute magnitude
    mn = 0;
    mx = mx * 1.1; // 10% headroom
    rng = mx - mn || 1;
  } else if (rng === 0) {
    // All values identical — show a stable line with ±10% padding
    mn = mn * 0.9;
    mx = mx * 1.1;
    rng = mx - mn || 1;
  } else if (rng < mx * 0.05) {
    // Very small range (less than 5% of max) — widen so stable data looks stable
    var centre = (mn + mx) / 2;
    var spread = mx * 0.05;
    mn = centre - spread;
    mx = centre + spread;
    rng = mx - mn;
  } else {
    // Normal range: small padding
    mn = mn - rng * 0.05;
    mx = mx + rng * 0.05;
    rng = mx - mn || 1;
  }

  function xPos(i) { return padL + (i / (series.length - 1)) * chartW; }
  function yPos(v) { return padT + chartH - ((v - mn) / rng) * chartH; }

  var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="display:block; max-width:' + W + 'px; border-radius:8px; background:#FAFBFC;">';

  // Grid lines (5 steps for better readability)
  var gridCount = 5;
  var gridSteps = [];
  for (var gi = 0; gi <= gridCount; gi++) {
    gridSteps.push(mn + (rng * gi / gridCount));
  }
  for (var g = 0; g < gridSteps.length; g++) {
    var gy = yPos(gridSteps[g]);
    svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#E2E8F0" stroke-width="0.5" stroke-dasharray="4,4"/>';
    svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" fill="#94A3B8" font-size="9" font-family="DM Sans,sans-serif">' + opts.yFormat(Math.round(gridSteps[g])) + '</text>';
  }

  // Bar chart
  if (opts.chartType === 'bar' || opts.chartType === 'combo') {
    var barW = Math.max(4, (chartW / series.length) * 0.6);
    var bColor = opts.barColor || opts.color + '44';
    for (var b = 0; b < series.length; b++) {
      var bx = xPos(b) - barW / 2;
      var by = yPos(series[b].value);
      var bh = padT + chartH - by;
      if (bh > 0) {
        svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + bColor + '" rx="2">';
        svg += '<title>' + (series[b].date || '') + ': ' + opts.yFormat(series[b].value) + '</title>';
        svg += '</rect>';
      }
      // Value label on top of non-zero bars (only show if not too many points)
      if (series[b].value > 0 && series.length <= 30) {
        svg += '<text x="' + xPos(b) + '" y="' + (by - 4) + '" text-anchor="middle" fill="' + opts.color + '" font-size="8" font-weight="600" font-family="DM Sans,sans-serif">' + opts.yFormat(series[b].value) + '</text>';
      }
    }
  }

  // Line chart
  if (opts.chartType === 'line' || opts.chartType === 'combo') {
    // Fill area
    var fillPts = [];
    for (var f = 0; f < series.length; f++) {
      fillPts.push(xPos(f) + ',' + yPos(series[f].value));
    }
    fillPts.push(xPos(series.length - 1) + ',' + (padT + chartH));
    fillPts.push(xPos(0) + ',' + (padT + chartH));
    svg += '<polygon points="' + fillPts.join(' ') + '" fill="' + (opts.fillColor || opts.color) + '" opacity="0.08"/>';

    // Line
    var linePts = series.map(function(s, i) { return xPos(i) + ',' + yPos(s.value); }).join(' ');
    svg += '<polyline points="' + linePts + '" fill="none" stroke="' + opts.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

    // Data points
    if (series.length <= 30) {
      for (var p = 0; p < series.length; p++) {
        svg += '<circle cx="' + xPos(p) + '" cy="' + yPos(series[p].value) + '" r="3" fill="' + opts.color + '" stroke="#fff" stroke-width="1.5">';
        svg += '<title>' + (series[p].date || '') + ': ' + opts.yFormat(series[p].value) + '</title>';
        svg += '</circle>';
      }
    }
  }

  // Marker lines (strategy annotations)
  if (opts.markers && opts.markers.length > 0) {
    var dateToIdx = {};
    series.forEach(function(s, i) { dateToIdx[s.date] = i; });
    var markerTypeClr = {
      strategy: '#7C5CFC', content: '#3B82F6', milestone: '#22C55E', issue: '#EF4444'
    };
    var markerIcons = { strategy: '🎯', content: '📝', milestone: '🏆', issue: '⚠️' };
    for (var m = 0; m < opts.markers.length; m++) {
      var mk = opts.markers[m];
      var mDate = mk.date;
      if (dateToIdx[mDate] != null) {
        var mx2 = xPos(dateToIdx[mDate]);
        var mClr = markerTypeClr[mk.type] || '#7C5CFC';
        svg += '<line x1="' + mx2 + '" y1="' + padT + '" x2="' + mx2 + '" y2="' + (padT + chartH) + '" stroke="' + mClr + '" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>';
        svg += '<circle cx="' + mx2 + '" cy="' + (padT + 6) + '" r="6" fill="' + mClr + '" opacity="0.9"/>';
        var mLabel = (mk.text || '').slice(0, 18);
        svg += '<text x="' + mx2 + '" y="' + (padT - 4) + '" text-anchor="middle" fill="' + mClr + '" font-size="8" font-family="DM Sans,sans-serif" font-weight="600">' + mLabel + '</text>';
        svg += '<title>' + (markerIcons[mk.type] || '') + ' ' + (mk.text || '') + ' (' + mDate + ')</title>';
      }
    }
  }

  // X-axis date labels
  var labelEvery = series.length <= 10 ? 1 : series.length <= 20 ? 2 : Math.ceil(series.length / 8);
  for (var x = 0; x < series.length; x += labelEvery) {
    var xDate = series[x].date || '';
    var shortDate = xDate.slice(5); // MM-DD
    svg += '<text x="' + xPos(x) + '" y="' + (H - 6) + '" text-anchor="middle" fill="#94A3B8" font-size="9" font-family="DM Sans,sans-serif">' + shortDate + '</text>';
  }

  // Label
  if (opts.label) {
    svg += '<text x="' + padL + '" y="12" fill="#475569" font-size="10" font-weight="600" font-family="DM Sans,sans-serif">' + opts.label + '</text>';
  }

  svg += '</svg>';
  return svg;
}

// ─── Delta pill helper ──────────
function deltaPill(val, suffix) {
  suffix = suffix || '';
  if (val > 0) return '<span style="' + DS.greenDelta + '">↑ ' + (typeof val === 'string' ? val : '+' + fmt(val)) + suffix + '</span>';
  if (val < 0) return '<span style="' + DS.redDelta + '">↓ ' + (typeof val === 'string' ? val : fmt(val)) + suffix + '</span>';
  return '<span style="' + DS.grayDelta + '">→ 0' + suffix + '</span>';
}

// ═══════════════════════════════════════════════════
// TAB: Data Hub — General metrics + Before/After + Wayback
// ═══════════════════════════════════════════════════
window.renderDataHub = function(d) {
  if (!d.metrics?.platforms && !d.posts?.platforms) {
    return '<div style="' + DS.muted + '; padding:40px; text-align:center;">No data available. Run the scraper first.</div>';
  }

  const platforms = d.metrics?.platforms || {};
  const posts = d.posts?.platforms || {};
  const history = d.history?.scrapeHistory || d.history?.snapshots || [];

  // Helper: get latest non-zero follower value from history for a platform
  function historyFallback(history, platform) {
    for (var i = history.length - 1; i >= 0; i--) {
      var snap = history[i];
      if (platform === 'instagram' && snap?.instagram?.followers > 0) return snap.instagram.followers;
      if (platform === 'tiktok' && snap?.tiktok?.followers > 0) return snap.tiktok.followers;
      if (platform === 'facebook') {
        var fbVal = snap?.facebook?.pageLikes || snap?.facebook?.followers;
        if (fbVal > 0) return fbVal;
      }
      if (platform === 'linkedin' && snap?.linkedin?.followers > 0) return snap.linkedin.followers;
    }
    return 0;
  }

  // ── A5 fix: compute per-platform window descriptor so every aggregate card
  // shows users WHAT WINDOW they're looking at. Previously aggregates were
  // labelled "Total Views" with no hint that they covered only ~last 28 days
  // of scraped posts, while a sibling card claimed "Total Posts: 327" (all-time).
  function postWindowLabel(pPosts) {
    if (!pPosts || pPosts.length === 0) return null;
    const dates = pPosts.map(p => normalizeDate(p.date)).filter(Boolean).sort();
    if (dates.length === 0) return 'Scraped · ' + pPosts.length + ' posts';
    const first = dates[0];
    const last = dates[dates.length - 1];
    const days = Math.max(1, Math.round((new Date(last) - new Date(first)) / 86400000));
    return 'Last ' + days + 'd · ' + pPosts.length + ' posts';
  }

  // Aggregate stats per platform
  const platformData = [];
  for (const [key, data] of Object.entries(platforms)) {
    const pPosts = posts[key] || [];
    const totalViews = pPosts.reduce((s, p) => s + (p.views || 0), 0);
    const totalEng = pPosts.reduce((s, p) => s + engScore(p), 0);
    const totalLikes = pPosts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalComments = pPosts.reduce((s, p) => s + (p.comments || 0), 0);
    const totalShares = pPosts.reduce((s, p) => s + (p.shares || 0), 0);
    const totalSaves = pPosts.reduce((s, p) => s + (p.saves || 0), 0);
    const windowLabel = postWindowLabel(pPosts);

    // Use current followers if >0, otherwise fall back to last known value from history
    var rawFollowers = data.followers || data.pageLikes || 0;
    var followers = rawFollowers > 0 ? rawFollowers : historyFallback(history, key);

    platformData.push({
      key,
      icon: platformIcons[key] || '📊',
      color: platformColors[key] || '#94A3B8',
      followers: followers,
      following: data.following || 0,
      totalPosts: data.posts || data.totalPosts || 0,
      totalLikes: data.likes || 0,
      bio: data.bio || '',
      contentPublished: pPosts.length,
      views: totalViews,
      engagement: totalEng,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      saves: totalSaves,
      avgEngPerPost: pPosts.length > 0 ? Math.round(totalEng / pPosts.length) : 0,
      avgViewsPerPost: pPosts.length > 0 ? Math.round(totalViews / pPosts.length) : 0,
      engRate: followers > 0 && pPosts.length > 0
        ? ((totalEng / pPosts.length) / followers * 100).toFixed(2)
        : pPosts.length > 0 ? '0.00' : '—',
      windowLabel,
      // A12: per-post engagement series for percentile context on this platform
      _postViewSeries: pPosts.map(p => p.views || 0).filter(v => v > 0),
      _postEngSeries: pPosts.map(p => engScore(p)).filter(v => v > 0),
    });
  }

  // Aggregate window for the summary row. If platforms scraped over different windows
  // we report the widest span (least restrictive) so users aren't misled into thinking
  // a "Last 28d" label applies when one platform actually has 90 days of data.
  function aggregateWindowLabel() {
    const allDates = [];
    let totalScrapedPosts = 0;
    for (const [, pPosts] of Object.entries(posts)) {
      if (!Array.isArray(pPosts)) continue;
      totalScrapedPosts += pPosts.length;
      for (const p of pPosts) {
        const d = normalizeDate(p.date);
        if (d) allDates.push(d);
      }
    }
    if (allDates.length === 0) return null;
    allDates.sort();
    const days = Math.max(1, Math.round((new Date(allDates[allDates.length - 1]) - new Date(allDates[0])) / 86400000));
    return 'Last ' + days + 'd · ' + totalScrapedPosts + ' posts scraped';
  }
  const summaryWindow = aggregateWindowLabel();

  // Summary row (all platforms)
  const totals = {
    followers: platformData.reduce((s, p) => s + p.followers, 0),
    views: platformData.reduce((s, p) => s + p.views, 0),
    engagement: platformData.reduce((s, p) => s + p.engagement, 0),
    contentPublished: platformData.reduce((s, p) => s + p.contentPublished, 0),
    likes: platformData.reduce((s, p) => s + p.likes, 0),
    comments: platformData.reduce((s, p) => s + p.comments, 0),
    shares: platformData.reduce((s, p) => s + p.shares, 0),
    saves: platformData.reduce((s, p) => s + p.saves, 0),
  };

  // Build sparkline data from history for each platform
  const historyIG = history.map(s => s?.instagram?.followers).filter(v => v != null);
  const historyTT = history.map(s => s?.tiktok?.followers).filter(v => v != null);
  const historyFB = history.map(s => (s?.facebook?.pageLikes || s?.facebook?.followers)).filter(v => v != null);
  const historyLI = history.map(s => s?.linkedin?.followers).filter(v => v != null);

  // Platform breakdown chips for summary cards
  function platformChips(metricKey) {
    if (platformData.length <= 1) return '';
    const chips = platformData
      .filter(p => p[metricKey] > 0)
      .sort((a, b) => b[metricKey] - a[metricKey])
      .map(p => '<span style="font-size:10px; padding:1px 6px; border-radius:3px; color:' + p.color + '; background:' + p.color + '12;">'
        + (platformIcons[p.key] || '') + ' ' + fmt(p[metricKey]) + '</span>')
      .join(' ');
    return chips ? '<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">' + chips + '</div>' : '';
  }

  // Metric cards (new design)
  function metricCard(label, value, iconHtml, delta, sparkData, sparkColor, contextLine, breakdownHtml) {
    const deltaHtml = delta != null ? deltaPill(delta) : '';
    const sparkHtml = sparklineSvg(sparkData, sparkColor || DS.brand);
    const ctxHtml = contextLine ? '<div style="' + DS.muted + '; margin-top:6px;">' + contextLine + '</div>' : '';
    return '<div style="' + DS.card + '">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">'
      + '<span style="' + DS.label + '">' + label + '</span>'
      + '<span style="font-size:14px;">' + (iconHtml || '') + '</span>'
      + '</div>'
      + '<div style="' + DS.metricValue + '">' + (typeof value === 'string' ? value : fmt(value)) + '</div>'
      + (deltaHtml ? '<div style="margin-top:6px;">' + deltaHtml + '</div>' : '')
      + (breakdownHtml || '')
      + (sparkHtml ? '<div style="margin-top:8px;">' + sparkHtml + '</div>' : '')
      + ctxHtml
      + '</div>';
  }

  // Summary cards with per-platform breakdown
  // A5: every aggregate card now carries a `Last Nd · M posts` badge so users know
  // the window. "Total Followers" stays unmarked (live profile metric, not a window).
  const activePlatformList = platformData.map(p => platformIcons[p.key] || p.key).join(' ');
  const winLine = summaryWindow ? summaryWindow : '';
  const summaryHtml = `
    <div style="${DS.muted}; font-size:12px; margin-bottom:8px;">Aggregated across ${platformData.length} platform${platformData.length !== 1 ? 's' : ''}: ${activePlatformList}${summaryWindow ? ' · <span style="color:#475569; font-weight:600;">' + summaryWindow + '</span>' : ''}</div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:24px;">
      ${metricCard('Total Followers', totals.followers, '👥', null, null, null, 'Live profile count', platformChips('followers'))}
      ${metricCard('Total Views', totals.views, '👁', null, null, null, winLine, platformChips('views'))}
      ${metricCard('Total Engagement', totals.engagement, '💬', null, null, null, winLine, platformChips('engagement'))}
      ${metricCard('Content Published', totals.contentPublished, '📱', null, null, null, winLine, platformChips('contentPublished'))}
      ${metricCard('Total Likes', totals.likes, '❤️', null, null, null, winLine, platformChips('likes'))}
      ${metricCard('Total Comments', totals.comments, '💬', null, null, null, winLine, platformChips('comments'))}
      ${metricCard('Total Shares', totals.shares, '🔄', null, null, null, winLine, platformChips('shares'))}
      ${metricCard('Total Saves', totals.saves, '🔖', null, null, null, winLine, platformChips('saves'))}
    </div>
  `;

  // Per-platform metric card rows
  // ── A1 + A6 fix: tri-state health pill + last-successful-scrape tooltip ──
  // Reads new freshness.status ('healthy'|'partial'|'failed') and pulls scrape-health.json
  // (loaded into d.scrapeHealth by the dashboard data loader) for the audit history.
  const freshness = d.metrics?.freshness || {};
  const scrapeHealth = d.scrapeHealth?.perPlatform || {};

  function statusStyle(status) {
    // Backwards-compat: legacy 'success'/'failed' still readable from older metrics-latest.json
    const s = status === 'success' ? 'healthy' : status;
    if (s === 'healthy') return { color: '#22C55E', icon: '✓', label: 'Healthy' };
    if (s === 'partial') return { color: '#F59E0B', icon: '⚠', label: 'Partial' };
    if (s === 'failed')  return { color: '#EF4444', icon: '✗', label: 'Failed' };
    return { color: '#94A3B8', icon: '?', label: 'Unknown' };
  }
  function daysSince(iso) {
    if (!iso) return null;
    return Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  }
  function attemptsTooltip(platformKey) {
    const h = scrapeHealth[platformKey];
    if (!h?.attempts?.length) return '';
    const last5 = h.attempts.slice(-5).reverse().map(a => {
      const t = new Date(a.ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const icon = a.status === 'healthy' ? '✓' : a.status === 'partial' ? '⚠' : '✗';
      return icon + ' ' + t + (a.status !== 'healthy' && a.missing_fields?.length ? ' (missing: ' + a.missing_fields.join(', ') + ')' : '');
    }).join('\n');
    const reliability = h.reliability_30d_pct != null ? h.reliability_30d_pct + '%' : 'n/a';
    const lastSuccess = h.last_success ? new Date(h.last_success).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
    return [
      '30-day reliability: ' + reliability,
      'Last successful scrape: ' + lastSuccess,
      '',
      'Last 5 attempts:',
      last5,
    ].join('\n');
  }

  const platformCardsHtml = platformData.map(p => {
    const sparkData = p.key === 'instagram' ? historyIG : p.key === 'tiktok' ? historyTT : p.key === 'linkedin' ? historyLI : historyFB;
    const pf = freshness[p.key];
    const sh = scrapeHealth[p.key];
    const ss = statusStyle(pf?.status);
    const lastSuccessIso = sh?.last_success || null;
    const successAge = daysSince(lastSuccessIso);
    const isStale = lastSuccessIso != null && successAge != null && successAge > 7;
    const freshnessTime = pf?.last_scraped ? new Date(pf.last_scraped).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never';
    const reliability = sh?.reliability_30d_pct;
    const tooltip = attemptsTooltip(p.key);
    const freshnessLabel = pf ? `${ss.icon} ${ss.label} · ${freshnessTime}` : 'No data';

    // A1 banner: yellow on partial, red on failed, orange on stale-success
    const bannerHtml = (() => {
      if (pf?.status === 'failed') {
        return `<div style="background:#FEE2E2; border:1px solid #FCA5A5; color:#991B1B; padding:8px 12px; border-radius:8px; font-size:12px; margin-bottom:12px;">
          <strong>✗ Scrape failed.</strong> ${pf.error || 'Unknown error.'} Last successful scrape: ${lastSuccessIso ? successAge + ' day' + (successAge === 1 ? '' : 's') + ' ago' : 'never'}.
        </div>`;
      }
      if (pf?.status === 'partial') {
        const missing = pf?.missing_fields?.length ? pf.missing_fields.join(', ') : 'unknown';
        return `<div style="background:#FEF3C7; border:1px solid #FCD34D; color:#92400E; padding:8px 12px; border-radius:8px; font-size:12px; margin-bottom:12px;">
          <strong>⚠ Partial scrape.</strong> Missing: ${missing}. The numbers below may understate actual activity.
        </div>`;
      }
      if (isStale) {
        return `<div style="background:#FFEDD5; border:1px solid #FDBA74; color:#9A3412; padding:8px 12px; border-radius:8px; font-size:12px; margin-bottom:12px;">
          <strong>⏳ Stale data.</strong> Last successful scrape was ${successAge} days ago. Re-run a scrape to refresh.
        </div>`;
      }
      return '';
    })();

    return `
    <div style="${DS.card}; margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:${bannerHtml ? '12' : '16'}px;">
        <span style="font-size:20px;">${p.icon}</span>
        <span style="font-size:16px; font-weight:700; color:#1E293B;">${p.key.charAt(0).toUpperCase() + p.key.slice(1)}</span>
        <span style="width:32px; height:4px; border-radius:2px; background:${p.color};"></span>
        ${(() => {
          // B3: prefer composite data-quality score when present, fall back to raw reliability
          const dq = sh?.data_quality_score;
          if (dq != null) {
            const tier = sh.data_quality_tier;
            const colour = tier === 'green' ? '#16A34A' : tier === 'amber' ? '#F59E0B' : '#EF4444';
            const bg = tier === 'green' ? 'rgba(34,197,94,0.12)' : tier === 'amber' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
            const br = sh.data_quality_breakdown || {};
            const tip = `Data quality score · ${Math.round(dq*100)}%\nRecency ${Math.round((br.recency||0)*100)}% · Reliability ${Math.round((br.reliability||0)*100)}% · Completeness ${Math.round((br.completeness||0)*100)}%`;
            return `<span title="${tip}" style="font-size:10px; color:${colour}; background:${bg}; padding:2px 6px; border-radius:4px; cursor:help;">Quality ${(dq*100).toFixed(0)}%</span>`;
          }
          return reliability != null ? `<span title="30-day scrape reliability" style="font-size:10px; color:#475569; background:#F1F5F9; padding:2px 6px; border-radius:4px;">${reliability}% rel.</span>` : '';
        })()}
        <span title="${tooltip.replace(/"/g,'&quot;')}" style="margin-left:auto; font-size:11px; color:${ss.color}; background:${ss.color}12; padding:2px 8px; border-radius:10px; cursor:help;">${freshnessLabel}</span>
      </div>
      ${bannerHtml}
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
        ${metricCard('Followers', p.followers, p.icon, null, sparkData, p.color, 'Live profile count')}
        ${metricCard('Views', p.views, '👁', null, null, null, p.windowLabel || '')}
        ${metricCard('Engagement', p.engagement, '💬', null, null, null, p.windowLabel || '')}
        ${metricCard('Posts Scraped', p.contentPublished, '📱', null, null, null, p.windowLabel || '')}
        ${metricCard('Avg Views/Post', p.avgViewsPerPost, '📊', null, null, null, (p.windowLabel || '') + ' ' + percentileBadge(computePercentile(p.avgViewsPerPost, p._postViewSeries), { context: 'this account\'s own posts' }))}
        ${metricCard('Avg Eng/Post', p.avgEngPerPost, '⚡', null, null, null, (p.windowLabel || '') + ' ' + percentileBadge(computePercentile(p.avgEngPerPost, p._postEngSeries), { context: 'this account\'s own posts' }))}
        ${metricCard('Eng Rate', p.engRate !== '—' ? p.engRate + '%' : '—', '📈', null, null, null, p.windowLabel || '')}
        ${metricCard('Total Posts', p.totalPosts, '📋', null, null, null, 'All-time')}
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:12px; padding-top:12px; border-top:1px solid #F1F5F9;">
        <span style="${DS.muted}">❤️ ${fmt(p.likes)} likes</span>
        <span style="${DS.muted}">💬 ${fmt(p.comments)} comments</span>
        <span style="${DS.muted}">🔄 ${fmt(p.shares)} shares</span>
        <span style="${DS.muted}">🔖 ${fmt(p.saves)} saves</span>
      </div>
    </div>`;
  }).join('');

  // ── Before / After Growth Section ──
  // ── A3 fix: single source of truth for follower deltas ──
  // Previously this section produced three different numbers: total growth from
  // an unrelated baseline, "+N today" from the second-to-last snapshot regardless
  // of when that snapshot was taken, and the chart used yet another window.
  // Now both card numbers go through computeFollowerDelta(), which:
  //   1. Picks the snapshot CLOSEST in time to (latest - sinceDays)
  //   2. Returns null if no snapshot exists within tolerance (no fabricated numbers)
  //   3. Reports the actual day-gap so the label can stay honest
  function computeFollowerDelta(history, getter, sinceDays, toleranceDays) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const valid = history.filter(s => {
      const v = getter(s);
      return v != null && v > 0 && s.date;
    });
    if (valid.length < 2) return null;
    const last = valid[valid.length - 1];
    const lastVal = getter(last);
    const lastTs = +new Date(last.date);
    const target = lastTs - sinceDays * 86400000;
    const tol = (toleranceDays != null ? toleranceDays : Math.max(1, sinceDays * 0.5)) * 86400000;
    let best = null, bestDiff = Infinity;
    for (let i = 0; i < valid.length - 1; i++) {
      const ts = +new Date(valid[i].date);
      const diff = Math.abs(ts - target);
      if (diff < bestDiff && diff <= tol) { best = valid[i]; bestDiff = diff; }
    }
    if (!best) return null;
    const fromVal = getter(best);
    const change = lastVal - fromVal;
    const actualDays = Math.max(1, Math.round((lastTs - +new Date(best.date)) / 86400000));
    return {
      from: fromVal, to: lastVal, change,
      pct: fromVal > 0 ? (change / fromVal) * 100 : 0,
      fromDate: best.date, toDate: last.date,
      daysBetween: actualDays,
    };
  }

  let beforeAfterHtml = '';
  if (history.length >= 2) {
    const last = history[history.length - 1];

    const growthCards = [];
    const pfList = [
      { key: 'instagram', label: '📸 Instagram', color: '#E4405F', getFollowers: s => s?.instagram?.followers },
      { key: 'tiktok', label: '🎵 TikTok', color: '#000000', getFollowers: s => s?.tiktok?.followers },
      { key: 'facebook', label: '👥 Facebook', color: '#1877F2', getFollowers: s => s?.facebook?.pageLikes || s?.facebook?.followers },
      { key: 'linkedin', label: '💼 LinkedIn', color: '#0A66C2', getFollowers: s => s?.linkedin?.followers },
    ];

    for (const pf of pfList) {
      const firstReal = history.find(s => {
        const v = pf.getFollowers(s);
        return v != null && v > 0;
      });
      if (!firstReal) continue;

      const bVal = pf.getFollowers(firstReal);
      const aVal = pf.getFollowers(last) || 0;
      if (bVal === aVal && firstReal === last) continue;

      // Use the same helper for "total growth" so the daysBetween label stays honest.
      const totalDays = Math.max(1, Math.round((new Date(last.date) - new Date(firstReal.date)) / 86400000));
      const totalDelta = computeFollowerDelta(history, pf.getFollowers, totalDays, totalDays + 1)
        || { from: bVal, to: aVal, change: aVal - bVal, pct: bVal > 0 ? ((aVal - bVal) / bVal) * 100 : 0, daysBetween: totalDays };
      const change = totalDelta.change;
      const pct = totalDelta.pct.toFixed(1);
      const daysBetween = totalDelta.daysBetween;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      const changeColor = change > 0 ? '#22C55E' : change < 0 ? '#EF4444' : '#94A3B8';
      const barWidth = Math.min(100, Math.max(5, (aVal / Math.max(bVal, 1)) * 50));

      // Daily change: snapshot closest to 24h before latest, tolerance ±2 days.
      // If no snapshot exists in that window, suppress the number (don't fabricate).
      const dailyDelta = computeFollowerDelta(history, pf.getFollowers, 1, 2);
      const dailyChange = dailyDelta ? dailyDelta.change : null;
      const dailyDaysBack = dailyDelta ? dailyDelta.daysBetween : null;
      const dailyLabel = dailyDelta
        ? (dailyDaysBack === 1 ? 'vs yesterday' : 'vs ' + dailyDaysBack + 'd ago')
        : 'no recent data';
      const dailyColor = dailyChange == null ? '#94A3B8' : dailyChange > 0 ? '#22C55E' : dailyChange < 0 ? '#EF4444' : '#94A3B8';

      growthCards.push(`
        <div style="${DS.card}; border-left:4px solid ${pf.color}; position:relative; overflow:hidden;">
          <div style="font-size:13px; color:${pf.color}; font-weight:600; margin-bottom:12px;">${pf.label}</div>
          <div style="display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="text-align:center;">
              <div style="${DS.label}">Baseline</div>
              <div style="${DS.muted}">${fmtDate(firstReal.date)}</div>
              <div style="font-size:24px; font-weight:700; color:#475569; margin-top:4px;">${fmt(bVal)}</div>
            </div>
            <div style="text-align:center; padding:0 12px;">
              <div style="font-size:28px; color:${changeColor};">${arrow}</div>
              <div style="color:${changeColor}; font-size:16px; font-weight:700;">${change > 0 ? '+' : ''}${fmt(change)} (${pct}%)</div>
              <div style="${DS.label}; margin-top:2px;" title="From ${fmtDate(totalDelta.fromDate || firstReal.date)} to ${fmtDate(totalDelta.toDate || last.date)} · ${daysBetween} days">Total growth · ${daysBetween}d</div>
              <div style="color:${dailyColor}; font-size:13px; font-weight:600; margin-top:6px;" title="${dailyDelta ? 'From ' + fmtDate(dailyDelta.fromDate) + ' to ' + fmtDate(dailyDelta.toDate) : 'No snapshot within ±2 days of yesterday'}">${dailyChange == null ? '— ' + dailyLabel : (dailyChange > 0 ? '+' : '') + fmt(dailyChange) + ' ' + dailyLabel}</div>
            </div>
            <div style="text-align:center;">
              <div style="${DS.label}">Now</div>
              <div style="${DS.muted}">${fmtDate(last.date)}</div>
              <div style="${DS.metricValue}; font-size:24px; margin-top:4px;">${fmt(aVal)}</div>
            </div>
          </div>
          <div style="margin-top:12px; height:6px; background:#F1F5F9; border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${barWidth}%; background:${DS.brand}; border-radius:3px;"></div>
          </div>
          <div style="${DS.muted}; margin-top:8px; text-align:center;">Tracked over ${daysBetween} days · ${pct}% ${change >= 0 ? 'growth' : 'decline'}</div>
        </div>
      `);
    }

    if (growthCards.length > 0) {
      beforeAfterHtml = `
        <div style="margin-bottom:24px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <h3 style="${DS.sectionTitle}; margin-bottom:0;">📊 Growth Tracker</h3>
            <span style="${DS.muted}">From first recorded baseline to now</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            ${growthCards.join('')}
          </div>
        </div>
      `;
    }
  }

  // ── Time-Series Charts Section ──
  let chartsHtml = '';
  if (history.length >= 2) {
    const markers = d.markers?.markers || [];
    const pfCharts = [
      { key: 'instagram', label: '📸 Instagram', color: '#E4405F', get: s => s?.instagram?.followers },
      { key: 'tiktok', label: '🎵 TikTok', color: '#000000', get: s => s?.tiktok?.followers },
      { key: 'facebook', label: '👥 Facebook', color: '#1877F2', get: s => (s?.facebook?.pageLikes || s?.facebook?.followers) },
      { key: 'linkedin', label: '💼 LinkedIn', color: '#0A66C2', get: s => s?.linkedin?.followers },
    ];

    let chartsInner = '';
    for (const pf of pfCharts) {
      // Followers over time — build from history snapshots
      const followerSeries = [];
      for (const snap of history) {
        const v = pf.get(snap);
        if (v != null && v > 0) {
          followerSeries.push({ date: (snap.date || '').slice(0, 10), value: v });
        }
      }
      // Deduplicate by date (keep latest)
      const seen = {};
      const deduped = [];
      for (const s of followerSeries) {
        seen[s.date] = s;
      }
      for (const dk of Object.keys(seen).sort()) {
        deduped.push(seen[dk]);
      }

      if (deduped.length < 2) continue;

      // Fill gaps: interpolate missing dates between first and today
      var today = new Date().toISOString().slice(0, 10);
      var filledFollowers = [];
      var firstD = new Date(deduped[0].date);
      var lastD = new Date(today);
      var cursorD = new Date(firstD);
      var dedupedIdx = 0;
      var lastVal = deduped[0].value;
      while (cursorD <= lastD) {
        var curDate = cursorD.toISOString().slice(0, 10);
        if (seen[curDate]) {
          lastVal = seen[curDate].value;
          filledFollowers.push({ date: curDate, value: lastVal });
        } else {
          // Carry forward last known value for gap days
          filledFollowers.push({ date: curDate, value: lastVal });
        }
        cursorD.setDate(cursorD.getDate() + 1);
      }

      // Engagement per post over time from posts data
      // Use the FULL date range from earliest history to today
      const pfPosts = posts[pf.key] || [];
      const engByDate = {};
      const likesByDate = {};
      for (const p of pfPosts) {
        const dk = normalizeDate(p.date);
        if (!dk) continue;
        if (!engByDate[dk]) engByDate[dk] = { total: 0, count: 0 };
        if (!likesByDate[dk]) likesByDate[dk] = { total: 0, count: 0 };
        engByDate[dk].total += engScore(p);
        engByDate[dk].count++;
        likesByDate[dk].total += (p.likes || 0);
        likesByDate[dk].count++;
      }

      // Build full date range from first history entry to today
      const allDates = deduped.map(s => s.date);
      var todayStr = new Date().toISOString().slice(0, 10);
      if (allDates.length > 0 && allDates[allDates.length - 1] < todayStr) allDates.push(todayStr);
      const firstDate = allDates[0];
      const lastDate = allDates[allDates.length - 1];
      const fullDateRange = [];
      if (firstDate && lastDate) {
        var cursor = new Date(firstDate);
        var end = new Date(lastDate);
        while (cursor <= end) {
          fullDateRange.push(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      // Only include dates where posts actually exist (skip empty days)
      const engSeries = fullDateRange
        .filter(dk => engByDate[dk] && engByDate[dk].count > 0)
        .map(dk => ({
          date: dk, value: Math.round(engByDate[dk].total / engByDate[dk].count)
        }));
      const likesSeries = fullDateRange
        .filter(dk => likesByDate[dk] && likesByDate[dk].count > 0)
        .map(dk => ({
          date: dk, value: Math.round(likesByDate[dk].total / likesByDate[dk].count)
        }));

      chartsInner += '<div style="' + DS.card + '; margin-bottom:16px; border-left:4px solid ' + pf.color + ';">'
        + '<h4 style="font-size:14px; font-weight:700; color:' + pf.color + '; margin-bottom:12px;">' + pf.label + ' — Growth & Performance</h4>'
        + '<div style="margin-bottom:16px;">'
        + '<div style="' + DS.label + '; margin-bottom:6px;">Followers Over Time</div>'
        + buildTimeSeriesChart(filledFollowers, { color: pf.color, label: '', chartType: 'combo', markers: markers, width: 700, height: 220 })
        + '</div>';

      var engNonZero = engSeries.filter(function(s) { return s.value > 0; }).length;
      var likesNonZero = likesSeries.filter(function(s) { return s.value > 0; }).length;
      if (engNonZero >= 2) {
        chartsInner += '<div style="margin-bottom:16px;">'
          + '<div style="' + DS.label + '; margin-bottom:6px;">Avg Engagement Per Post</div>'
          + buildTimeSeriesChart(engSeries, { color: '#F59E0B', chartType: 'bar', barColor: '#F59E0B55', width: 700, height: 180 })
          + '</div>';
      }
      if (likesNonZero >= 2) {
        chartsInner += '<div>'
          + '<div style="' + DS.label + '; margin-bottom:6px;">Avg Likes Per Post</div>'
          + buildTimeSeriesChart(likesSeries, { color: '#EF4444', chartType: 'bar', barColor: '#EF444444', width: 700, height: 180 })
          + '</div>';
      }

      chartsInner += '</div>';
    }

    if (chartsInner) {
      chartsHtml = '<div style="margin-bottom:24px;">'
        + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">'
        + '<h3 style="' + DS.sectionTitle + '; margin-bottom:0;">📈 Growth & Engagement Charts</h3>'
        + '<span style="' + DS.muted + '">Time-series per platform with strategy markers</span>'
        + '</div>'
        + chartsInner
        + '</div>';
    }
  }

  // ── Monthly View & Impression Counter (McKinsey-style) ──
  let monthlyViewsHtml = '';
  const allMonthlyPosts = [];
  for (const [pfKey, pfPosts] of Object.entries(posts)) {
    for (const p of pfPosts) {
      allMonthlyPosts.push({ ...p, platform: pfKey });
    }
  }
  if (allMonthlyPosts.length > 0) {
    const byMonth = {};
    for (const p of allMonthlyPosts) {
      const mk = getMonthKey(p.date);
      if (!mk) continue;
      if (!byMonth[mk]) byMonth[mk] = { views: 0, engagement: 0, likes: 0, posts: 0, platforms: {} };
      byMonth[mk].views += (p.views || 0);
      byMonth[mk].engagement += engScore(p);
      byMonth[mk].likes += (p.likes || 0);
      byMonth[mk].posts++;
      if (!byMonth[mk].platforms[p.platform]) byMonth[mk].platforms[p.platform] = 0;
      byMonth[mk].platforms[p.platform]++;
    }

    const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    if (sortedMonths.length > 0) {
      // ── A2 fix: day-aligned MTD comparison so we don't compare 4 days vs 30 days.
      // For the current (incomplete) month, recompute prior-month aggregates using
      // ONLY days 1..elapsedDays so the delta is like-for-like. Suppress % until
      // at least 3 days have elapsed (sub-3-day samples are too noisy).
      const today = new Date();
      const todayMk = today.getUTCFullYear() + '-' + String(today.getUTCMonth() + 1).padStart(2, '0');
      const elapsedDays = today.getUTCDate(); // 1..31
      const isMtdMonth = (mk) => mk === todayMk;
      const minDaysForPct = 3;

      // Build a per-day index once so we can window prior-month posts cheaply.
      const postsByDay = {}; // mk -> { day -> {views, engagement} }
      for (const p of allMonthlyPosts) {
        const dateStr = normalizeDate(p.date);
        if (!dateStr) continue;
        const mk = dateStr.slice(0, 7);
        const day = parseInt(dateStr.slice(8, 10), 10);
        if (!postsByDay[mk]) postsByDay[mk] = {};
        if (!postsByDay[mk][day]) postsByDay[mk][day] = { views: 0, engagement: 0 };
        postsByDay[mk][day].views += (p.views || 0);
        postsByDay[mk][day].engagement += engScore(p);
      }
      function windowAggregate(mk, throughDay) {
        const days = postsByDay[mk] || {};
        let views = 0, engagement = 0;
        for (let d = 1; d <= throughDay; d++) {
          if (days[d]) { views += days[d].views; engagement += days[d].engagement; }
        }
        return { views, engagement };
      }

      const monthCards = sortedMonths.map(function(mk, idx) {
        const md = byMonth[mk];
        const prevMk = sortedMonths[idx + 1];
        let prevMd = prevMk ? byMonth[prevMk] : null;
        const mtd = isMtdMonth(mk);

        // For the in-progress current month, window the comparison to like-for-like days.
        if (mtd && prevMk) {
          prevMd = windowAggregate(prevMk, elapsedDays);
        }

        // Suppress the percentage on the current month until enough days have elapsed.
        const showPct = !(mtd && elapsedDays < minDaysForPct);

        const viewsDelta = prevMd ? md.views - prevMd.views : null;
        const engDelta = prevMd ? md.engagement - prevMd.engagement : null;
        const viewsPct = (showPct && prevMd && prevMd.views > 0) ? ((viewsDelta / prevMd.views) * 100).toFixed(1) : null;
        const engPct = (showPct && prevMd && prevMd.engagement > 0) ? ((engDelta / prevMd.engagement) * 100).toFixed(1) : null;
        const engRate = md.views > 0 ? ((md.engagement / md.views) * 100).toFixed(2) : (md.posts > 0 ? '0.00' : null);
        const avgEngPerPost = md.posts > 0 ? Math.round(md.engagement / md.posts) : 0;

        const pfBreakdown = Object.entries(md.platforms).map(function(e) {
          return '<span style="font-size:10px; color:' + (platformColors[e[0]] || '#94A3B8') + '; background:' + (platformColors[e[0]] || '#94A3B8') + '11; padding:2px 6px; border-radius:6px;">' + (platformIcons[e[0]] || '') + ' ' + e[1] + '</span>';
        }).join(' ');

        const mtdBadge = mtd
          ? '<span title="Month-to-date: ' + elapsedDays + ' day' + (elapsedDays === 1 ? '' : 's') + ' elapsed. Compared like-for-like against the same days of the prior month." style="font-size:9px; font-weight:700; letter-spacing:0.06em; color:#92400E; background:#FEF3C7; border:1px solid #FCD34D; padding:2px 6px; border-radius:4px; margin-left:6px; vertical-align:middle;">MTD · ' + elapsedDays + 'd</span>'
          : '';

        return '<div style="' + DS.card + '; border-top:3px solid ' + DS.brand + ';">'
          + '<div style="font-size:16px; font-weight:800; color:#1E293B; margin-bottom:2px;">' + monthLabel(mk) + mtdBadge + '</div>'
          + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0;">'
          + '<div style="background:#F8FAFC; border-radius:10px; padding:10px; text-align:center;">'
          + '<div style="' + DS.label + '">Total Views</div>'
          + '<div style="font-size:22px; font-weight:700; color:#1E293B;">' + fmt(md.views) + '</div>'
          + (viewsDelta != null ? '<div style="margin-top:2px;">' + deltaPill(viewsDelta) + (viewsPct ? ' <span style="font-size:11px; color:#94A3B8;">(' + viewsPct + '%)</span>' : '') + '</div>' : '')
          + '</div>'
          + '<div style="background:#F8FAFC; border-radius:10px; padding:10px; text-align:center;">'
          + '<div style="' + DS.label + '">Total Engagement</div>'
          + '<div style="font-size:22px; font-weight:700; color:#1E293B;">' + fmt(md.engagement) + '</div>'
          + (engDelta != null ? '<div style="margin-top:2px;">' + deltaPill(engDelta) + (engPct ? ' <span style="font-size:11px; color:#94A3B8;">(' + engPct + '%)</span>' : '') + '</div>' : '')
          + '</div></div>'
          + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">'
          + '<div style="background:#F0FDF4; border-radius:8px; padding:6px 10px; text-align:center;">'
          + '<div style="' + DS.label + '">Eng Rate</div>'
          + '<div style="font-size:16px; font-weight:700; color:#22C55E;">' + (engRate != null ? engRate + '%' : '—') + '</div>'
          + '</div>'
          + '<div style="background:#EFF6FF; border-radius:8px; padding:6px 10px; text-align:center;">'
          + '<div style="' + DS.label + '">Avg Eng/Post</div>'
          + '<div style="font-size:16px; font-weight:700; color:#3B82F6;">' + fmt(avgEngPerPost) + '</div>'
          + '</div></div>'
          + '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">'
          + '<span style="' + DS.muted + '">' + md.posts + ' posts</span>'
          + '<span style="' + DS.muted + '">·</span>'
          + '<span style="' + DS.muted + '">❤️ ' + fmt(md.likes) + ' likes</span>'
          + '</div>'
          + '<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:8px;">' + pfBreakdown + '</div>'
          + '</div>';
      }).join('');

      monthlyViewsHtml = '<div style="margin-bottom:24px;">'
        + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">'
        + '<h3 style="' + DS.sectionTitle + '; margin-bottom:0;">📊 Monthly Performance</h3>'
        + '<span style="' + DS.muted + '">Aggregated views, engagement & impressions per month</span>'
        + '</div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">'
        + monthCards
        + '</div></div>';
    }
  }

  // ── Posting Frequency & Impact Analysis ──
  let postingFreqHtml = '';
  if (true) { // Always attempt — posting data comes from posts, not history
    const pfFreqConfigs = [
      { key: 'instagram', label: '📸 Instagram', color: '#E4405F' },
      { key: 'tiktok', label: '🎵 TikTok', color: '#000000' },
      { key: 'facebook', label: '👥 Facebook', color: '#1877F2' },
      { key: 'linkedin', label: '💼 LinkedIn', color: '#0A66C2' },
    ];

    let freqCards = '';
    for (const pfc of pfFreqConfigs) {
      const pfPosts = posts[pfc.key] || [];
      if (pfPosts.length === 0) continue;

      // Count posts per week
      const postsByWeek = {};
      for (const p of pfPosts) {
        const d2 = normalizeDate(p.date);
        if (!d2) continue;
        var dt = new Date(d2);
        var weekStart = new Date(dt);
        weekStart.setDate(dt.getDate() - dt.getDay());
        var wk = weekStart.toISOString().slice(0, 10);
        if (!postsByWeek[wk]) postsByWeek[wk] = 0;
        postsByWeek[wk]++;
      }

      var weeks = Object.keys(postsByWeek).sort();
      if (weeks.length === 0) continue;

      var totalWeeklyPosts = weeks.reduce(function(s, w) { return s + postsByWeek[w]; }, 0);
      var avgPerWeek = (totalWeeklyPosts / weeks.length).toFixed(1);

      // Correlate with follower growth from history
      var getFollowers = function(snap) {
        if (pfc.key === 'instagram') return snap?.instagram?.followers;
        if (pfc.key === 'tiktok') return snap?.tiktok?.followers;
        if (pfc.key === 'facebook') return snap?.facebook?.pageLikes || snap?.facebook?.followers;
        if (pfc.key === 'linkedin') return snap?.linkedin?.followers;
        return null;
      };

      // Simple: compare growth in high-post vs low-post periods
      var highPostWeeks = weeks.filter(function(w) { return postsByWeek[w] >= 3; });
      var lowPostWeeks = weeks.filter(function(w) { return postsByWeek[w] < 2; });

      var insight = '';
      if (highPostWeeks.length > 0 && lowPostWeeks.length > 0) {
        var avgHighPosts = (highPostWeeks.reduce(function(s, w) { return s + postsByWeek[w]; }, 0) / highPostWeeks.length).toFixed(1);
        var avgLowPosts = lowPostWeeks.length > 0 ? (lowPostWeeks.reduce(function(s, w) { return s + postsByWeek[w]; }, 0) / lowPostWeeks.length).toFixed(1) : '0';
        insight = '<div style="margin-top:8px; font-size:12px; color:#475569; line-height:1.5;">'
          + '📈 High-activity weeks (' + highPostWeeks.length + ' weeks, avg ' + avgHighPosts + ' posts/wk) vs '
          + '📉 Low-activity weeks (' + lowPostWeeks.length + ' weeks, avg ' + avgLowPosts + ' posts/wk)'
          + '</div>';
      }

      // Frequency bar
      var maxPosts = Math.max.apply(null, weeks.map(function(w) { return postsByWeek[w]; }));
      var freqBars = weeks.slice(-8).map(function(w) {
        var cnt = postsByWeek[w];
        var pct = (cnt / Math.max(maxPosts, 1)) * 100;
        return '<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;">'
          + '<div style="width:100%; height:40px; background:#F1F5F9; border-radius:4px; display:flex; align-items:flex-end; overflow:hidden;">'
          + '<div style="width:100%; height:' + pct + '%; background:' + pfc.color + '; border-radius:4px; transition:height 0.3s;"></div>'
          + '</div>'
          + '<span style="font-size:8px; color:#94A3B8;">' + cnt + '</span>'
          + '</div>';
      }).join('');

      freqCards += '<div style="' + DS.card + '; border-top:3px solid ' + pfc.color + ';">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
        + '<span style="font-weight:700; font-size:13px; color:' + pfc.color + ';">' + pfc.label + '</span>'
        + '<span style="font-size:22px; font-weight:700; color:#1E293B;">' + avgPerWeek + ' <span style="font-size:11px; color:#94A3B8; font-weight:400;">posts/week</span></span>'
        + '</div>'
        + '<div style="display:flex; gap:3px; margin:8px 0;">' + freqBars + '</div>'
        + '<div style="' + DS.muted + '; font-size:10px; text-align:center;">Last ' + Math.min(8, weeks.length) + ' weeks</div>'
        + insight
        + '</div>';
    }

    if (freqCards) {
      postingFreqHtml = '<div style="margin-bottom:24px;">'
        + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">'
        + '<h3 style="' + DS.sectionTitle + '; margin-bottom:0;">📅 Posting Frequency</h3>'
        + '<span style="' + DS.muted + '">Weekly posting cadence per platform</span>'
        + '</div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">'
        + freqCards
        + '</div></div>';
    }
  }

  // ── Timeline & Markers Section ──
  let timelineHtml = '';
  if (history.length > 0) {
    const markers = d.markers?.markers || [];
    const markersByDate = {};
    markers.forEach(m => {
      if (!markersByDate[m.date]) markersByDate[m.date] = [];
      markersByDate[m.date].push(m);
    });

    const byDate = {};
    history.forEach(snap => {
      const dateKey = (snap.date || snap.scrapedAt || '').substring(0, 10);
      if (!dateKey) return;
      byDate[dateKey] = snap;
    });

    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const pfGetters = {
      instagram: { get: s => s?.instagram?.followers ?? null, label: 'IG', color: '#E4405F' },
      tiktok: { get: s => { var v = s?.tiktok?.followers; return (v != null && v > 0) ? v : null; }, label: 'TT', color: '#000000' },
      facebook: { get: s => { var v = s?.facebook?.pageLikes || s?.facebook?.followers; return (v != null && v > 0) ? v : null; }, label: 'FB', color: '#1877F2' },
      linkedin: { get: s => { var v = s?.linkedin?.followers; return (v != null && v > 0) ? v : null; }, label: 'LI', color: '#0A66C2' },
    };
    // Only show columns for platforms that have at least one non-null data point in history
    const activePfs = Object.keys(pfGetters).filter(k =>
      history.some(s => { const v = pfGetters[k].get(s); return v != null && v > 0; })
    );

    const markerTypeColors = {
      strategy: { bg: 'rgba(124,92,252,0.1)', fg: '#7C5CFC' },
      content:  { bg: 'rgba(59,130,246,0.1)', fg: '#3B82F6' },
      milestone:{ bg: 'rgba(34,197,94,0.1)',  fg: '#22C55E' },
      issue:    { bg: 'rgba(239,68,68,0.1)',  fg: '#EF4444' },
    };
    const markerTypeIcons = { strategy: '🎯', content: '📝', milestone: '🏆', issue: '⚠️' };

    function deltaCell(current, previous) {
      if (current == null) return '<td style="' + DS.td + ' text-align:center;">—</td>';
      if (previous == null) return '<td style="' + DS.td + ' text-align:center;">—</td>';
      const diff = current - previous;
      if (diff > 0) return '<td style="' + DS.td + ' text-align:center;"><span style="' + DS.greenDelta + '">+' + diff.toLocaleString() + '</span></td>';
      if (diff < 0) return '<td style="' + DS.td + ' text-align:center;"><span style="' + DS.redDelta + '">' + diff.toLocaleString() + '</span></td>';
      return '<td style="' + DS.td + ' text-align:center; color:#94A3B8;">0</td>';
    }

    // ── A9: precompute per-platform daily-delta series so we can detect spikes ──
    // For each platform, walk sortedDates (newest→oldest) and build a sequential array
    // of daily deltas. Then for each row index `i`, the "trailing 14 days" prior to it
    // is sortedDates[i+1..i+14]. If row i's delta exceeds (mean + 2*sd) of that window,
    // it's a candidate spike marker.
    const deltaSeriesByPf = {};
    for (const pfKey of activePfs) {
      const getter = pfGetters[pfKey];
      const seq = [];
      for (let i = 0; i < sortedDates.length; i++) {
        const cur = getter.get(byDate[sortedDates[i]]);
        const prev = i + 1 < sortedDates.length ? getter.get(byDate[sortedDates[i + 1]]) : null;
        seq.push((cur != null && prev != null) ? cur - prev : null);
      }
      deltaSeriesByPf[pfKey] = seq;
    }
    function spikeCandidates(rowIndex) {
      // Returns array of {platform, delta, multiple, direction} for any platform that spikes at row i.
      const out = [];
      for (const pfKey of activePfs) {
        const seq = deltaSeriesByPf[pfKey] || [];
        const delta = seq[rowIndex];
        if (delta == null || delta === 0) continue;
        const window = seq.slice(rowIndex + 1, rowIndex + 15).filter(v => v != null);
        if (window.length < 5) continue; // not enough history
        const { mean, sd } = meanStdev(window);
        if (sd === 0) continue;
        const z = Math.abs(delta - mean) / sd;
        if (z >= 2) {
          out.push({
            platform: pfKey,
            delta,
            z: +z.toFixed(2),
            direction: delta > 0 ? 'up' : 'down',
            color: pfGetters[pfKey].color,
            label: pfGetters[pfKey].label,
          });
        }
      }
      return out;
    }

    let tableRows = '';
    for (let i = 0; i < sortedDates.length; i++) {
      const dateKey = sortedDates[i];
      const snap = byDate[dateKey];
      const prevDateKey = sortedDates[i + 1];
      const prevSnap = prevDateKey ? byDate[prevDateKey] : null;

      const dateMarkers = markersByDate[dateKey] || [];
      let markerPills = dateMarkers.map(m => {
        const tc = markerTypeColors[m.type] || markerTypeColors.content;
        const icon = markerTypeIcons[m.type] || '📝';
        return '<span style="display:inline-flex; align-items:center; gap:4px; background:' + tc.bg + '; color:' + tc.fg + '; padding:2px 8px; border-radius:12px; font-size:11px; margin:2px; white-space:nowrap;">'
          + icon + ' ' + m.text
          + ' <span data-marker-delete="' + m.id + '" style="cursor:pointer; opacity:0.7; font-size:13px;" title="Delete marker">&times;</span>'
          + '</span>';
      }).join('');

      // ── A9: surface spike candidates on the same row ──
      // Only show if no human marker already exists for this date — don't nag.
      if (dateMarkers.length === 0) {
        const spikes = spikeCandidates(i);
        if (spikes.length > 0) {
          const spikePillHtml = spikes.map(s => {
            const arrow = s.direction === 'up' ? '↑' : '↓';
            const bg = s.direction === 'up' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
            const fg = s.direction === 'up' ? '#16A34A' : '#DC2626';
            const suggestedText = s.label + ' ' + arrow + ' ' + (s.delta > 0 ? '+' : '') + s.delta.toLocaleString() + ' (' + s.z + 'σ)';
            return '<span data-marker-suggest="' + dateKey + '" data-marker-suggest-text="' + s.label + ' spike: ' + arrow + ' ' + s.delta + ' (' + s.z + 'σ)" data-marker-suggest-type="issue" style="display:inline-flex; align-items:center; gap:4px; background:' + bg + '; color:' + fg + '; padding:2px 8px; border-radius:12px; font-size:11px; margin:2px; white-space:nowrap; cursor:pointer; border:1px dashed ' + fg + '99;" title="Click to accept and label this auto-detected spike">'
              + '🚨 ' + suggestedText + ' · click to label'
              + '</span>';
          }).join('');
          markerPills += spikePillHtml;
        }
      }

      const bgColor = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

      // Dynamic platform columns
      let pfCells = '';
      for (const pfKey of activePfs) {
        const getter = pfGetters[pfKey];
        const val = getter.get(snap);
        const prevVal = prevSnap ? getter.get(prevSnap) : null;
        pfCells += '<td style="' + DS.td + ' text-align:right; color:' + getter.color + ';">' + (val != null ? val.toLocaleString() : '—') + '</td>';
        pfCells += deltaCell(val, prevVal);
      }

      // A9 cleanup: hide the bare "+" button when row has no markers AND no spike.
      // Show on hover via CSS class. Reduces visual noise (was 40 dead buttons per page).
      const hasContent = markerPills.length > 0;
      const addBtn = '<span data-marker-toggle="' + dateKey + '" class="marker-add-btn" style="cursor:pointer;' + DS.btnSecondary + ';padding:2px 8px;font-size:12px;border-radius:12px;opacity:' + (hasContent ? '1' : '0') + ';transition:opacity 0.15s;" title="Add marker">+</span>';
      tableRows += '<tr class="timeline-row" style="background:' + bgColor + ';">'
        + '<td style="' + DS.td + ' white-space:nowrap; font-weight:500; color:#1E293B;">' + fmtDate(dateKey) + '</td>'
        + pfCells
        + '<td style="' + DS.td + ' min-width:200px;">'
          + '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:2px;">'
          + markerPills
          + addBtn
          + '</div>'
          + '<div id="marker-form-' + dateKey + '" style="display:none; gap:6px; align-items:center; margin-top:6px; flex-wrap:wrap;">'
            + '<input id="marker-text-' + dateKey + '" type="text" placeholder="Note..." style="flex:1; min-width:120px; ' + DS.input + '; font-size:12px; padding:4px 8px;">'
            + '<select id="marker-type-' + dateKey + '" style="' + DS.select + '; padding:4px 6px;">'
              + '<option value="strategy">🎯 Strategy</option>'
              + '<option value="content">📝 Content</option>'
              + '<option value="milestone">🏆 Milestone</option>'
              + '<option value="issue">⚠️ Issue</option>'
            + '</select>'
            + '<button data-marker-save="' + dateKey + '" style="' + DS.btnPrimary + '; padding:4px 12px; font-size:12px; border-radius:8px;">Save</button>'
          + '</div>'
        + '</td>'
        + '</tr>';
    }

    timelineHtml = `
      <div style="margin-bottom:24px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <h3 style="${DS.sectionTitle}; margin-bottom:0;">📅 Timeline &amp; Markers</h3>
          <span style="${DS.muted}">Daily follower changes with annotations</span>
        </div>
        <div style="${DS.card}; overflow-x:auto; padding:0;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr>
                <th style="${DS.th}">Date</th>
                ${activePfs.map(k => {
                  const pf = pfGetters[k];
                  return `<th style="${DS.th} text-align:right; color:${pf.color};">${pf.label} Followers</th>`
                    + `<th style="${DS.th} text-align:center; color:${pf.color};">${pf.label} Daily \u0394</th>`;
                }).join('')}
                <th style="${DS.th}">Markers</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          ${sortedDates.length === 0 ? '<p style="' + DS.muted + '; text-align:center; padding:16px;">No history snapshots recorded yet.</p>' : ''}
        </div>
      </div>
    `;
  }

  // ── Wayback Machine Section ──
  let waybackHtml = `
    <div style="margin-bottom:24px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <h3 style="${DS.sectionTitle}; margin-bottom:0;">🕰️ Wayback Machine Archive</h3>
        <span style="${DS.muted}">Historical snapshots from the Internet Archive</span>
      </div>
      <div id="wayback-container" style="${DS.card}">
        <button class="tab" data-action="fetch-wayback" style="${DS.btnPrimary}">
          🔍 Search archive
        </button>
        <button class="tab" data-action="archive-now" style="${DS.btnSecondary}; margin-left:8px;" title="Save current profile pages to Internet Archive so history accumulates">
          💾 Archive now
        </button>
        <span style="${DS.muted}; margin-left:12px;">Internet Archive snapshots — archive now to start the history, search later to see drift</span>
        <div id="wayback-results" style="margin-top:12px;"></div>
        <div id="wayback-archive-results" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  // ── A10: Outliers (Last 30d) — posts that beat trailing 30d baseline ≥3× ──
  // Surfaces breakout posts on the Overview so users don't need to dig the Posts tab.
  // Each card shows the post-identity badges so users instantly see WHAT format and
  // identity beat the baseline (e.g. "Reel · Talking head · Question hook").
  let outliersHtml = '';
  (function buildOutliers() {
    const allPostsFlat = [];
    for (const [pf, arr] of Object.entries(posts || {})) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        const d = normalizeDate(p.date);
        if (!d) continue;
        allPostsFlat.push({ ...p, platform: pf, _date: d, _eng: engScore(p) });
      }
    }
    if (allPostsFlat.length < 6) return; // not enough signal
    const today = Date.now();
    const last30 = allPostsFlat.filter(p => (today - new Date(p._date).getTime()) / 86400000 <= 30);
    const trailing = allPostsFlat.filter(p => {
      const ageDays = (today - new Date(p._date).getTime()) / 86400000;
      return ageDays > 30 && ageDays <= 120;
    });
    if (last30.length === 0 || trailing.length < 3) return;
    // Per-platform baseline so a viral TikTok doesn't drag IG's bar
    const baselineByPlatform = {};
    for (const p of trailing) {
      if (!baselineByPlatform[p.platform]) baselineByPlatform[p.platform] = [];
      baselineByPlatform[p.platform].push(p._eng);
    }
    const median = (arr) => {
      const s = [...arr].sort((a,b) => a-b);
      const m = Math.floor(s.length/2);
      return s.length % 2 ? s[m] : (s[m-1]+s[m]) / 2;
    };
    const platformMedian = {};
    for (const [pf, vals] of Object.entries(baselineByPlatform)) {
      platformMedian[pf] = median(vals) || 1;
    }
    const outliers = last30
      .filter(p => platformMedian[p.platform] > 0)
      .map(p => ({
        ...p,
        _baseline: platformMedian[p.platform],
        _multiple: p._eng / Math.max(1, platformMedian[p.platform]),
      }))
      .filter(p => p._multiple >= 3 && p._eng > 0)
      .sort((a, b) => b._multiple - a._multiple)
      .slice(0, 3);
    if (outliers.length === 0) return;

    // Build the index for identity badges
    const classByUrl = {};
    for (const c of (d.classifications || [])) {
      if (c.post_id) classByUrl[c.post_id] = c;
      if (c.url) classByUrl[c.url] = c;
    }

    const cards = outliers.map(p => {
      const platformColor = platformColors[p.platform] || '#94A3B8';
      const captionShort = (p.caption || '').slice(0, 100);
      const idBadges = window.postIdentityBadges ? window.postIdentityBadges(p, classByUrl) : '';
      const why = [];
      const cls = classByUrl[p.url];
      if (cls?.hook_type) why.push('hook: ' + cls.hook_type.replace(/[-_]/g,' '));
      if (cls?.content_type) why.push('topic: ' + cls.content_type.replace(/[-_]/g,' '));
      const whyLine = why.length ? '<div style="' + DS.muted + '; font-size:11px; margin-top:4px;">' + why.join(' · ') + '</div>' : '';
      const whyId = 'why-' + Math.random().toString(36).slice(2, 8);
      return '<div style="' + DS.card + '; border-left:4px solid ' + platformColor + ';">'
        + '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">'
        + '<div style="flex:1;">'
        + '<div style="font-size:11px; color:' + platformColor + '; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">' + p.platform + ' · ' + p._multiple.toFixed(1) + '× baseline</div>'
        + idBadges
        + '<div style="font-size:13px; color:#1E293B; line-height:1.4; margin-top:6px;">' + (captionShort || '—') + (captionShort.length >= 100 ? '…' : '') + '</div>'
        + whyLine
        + '<div id="' + whyId + '" style="margin-top:8px;"></div>'
        + '</div>'
        + '<div style="text-align:right; min-width:90px;">'
        + '<div style="font-size:18px; font-weight:800; color:#1E293B;">' + fmt(p._eng) + '</div>'
        + '<div style="' + DS.label + '">vs ' + fmt(Math.round(p._baseline)) + ' med.</div>'
        + '</div></div>'
        + '<div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">'
        + (p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener" style="color:' + DS.brand + '; text-decoration:none; font-size:12px; font-weight:600;">View post ↗</a>' : '')
        + '<button type="button" data-why-worked="' + encodeURIComponent(p.url || '') + '" data-why-target="' + whyId + '" style="background:none;border:1px solid #E2E8F0;color:#475569;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">✦ Why this worked</button>'
        + '</div>'
        + '</div>';
    }).join('');

    outliersHtml = '<div style="margin-bottom:24px;">'
      + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">'
      + '<h3 style="' + DS.sectionTitle + '; margin-bottom:0;">🚀 Outliers · Last 30 days</h3>'
      + '<span style="' + DS.muted + '">Posts beating trailing 90d median by ≥3×</span>'
      + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:12px;">' + cards + '</div>'
      + '</div>';
  })();

  // ── A11: Cross-platform content clusters ──
  // Surfaces the same content idea posted across multiple platforms with
  // a per-platform engagement multiplier so you can see, e.g., "IG carousel
  // got 4× the engagement of the TT cut of this same story."
  let clustersHtml = '';
  (function buildClusters() {
    const clusters = (d.contentClusters?.clusters || []).slice(0, 5);
    if (clusters.length === 0) return;
    const cards = clusters.map(c => {
      const liftBadges = Object.entries(c.lifts || {}).map(([pf, mult]) => {
        const colour = pf === c.dominantPlatform ? '#16A34A' : '#475569';
        const bg = pf === c.dominantPlatform ? 'rgba(34,197,94,0.12)' : '#F1F5F9';
        const icon = platformIcons[pf] || pf;
        return '<span style="font-size:11px; font-weight:600; color:' + colour + '; background:' + bg + '; padding:2px 8px; border-radius:6px;">' + icon + ' ' + mult.toFixed(2) + '×</span>';
      }).join(' ');
      const postRows = c.posts.map(p => {
        const colour = platformColors[p.platform] || '#94A3B8';
        const icon = platformIcons[p.platform] || '';
        const erText = p.er != null ? p.er.toFixed(2) + '% ER' : '—';
        return '<div style="display:flex; gap:8px; align-items:center; padding:6px 0; border-top:1px solid #F1F5F9;">'
          + '<span style="color:' + colour + '; font-weight:600; min-width:24px;">' + icon + '</span>'
          + '<span style="' + DS.muted + '; min-width:80px;">' + fmtDate(p.date) + '</span>'
          + '<span style="flex:1; font-size:12px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(p.caption) + '</span>'
          + '<span style="' + DS.muted + ';">👁 ' + fmt(p.views) + '</span>'
          + '<span style="' + DS.muted + ';">' + erText + '</span>'
          + (p.url ? '<a href="' + safeHref(p.url) + '" target="_blank" rel="noopener" style="color:' + DS.brand + '; font-size:11px;">↗</a>' : '')
          + '</div>';
      }).join('');
      return '<div style="' + DS.card + '; padding:16px 20px;">'
        + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">'
        + '<div style="font-size:13px; font-weight:600; color:#1E293B; flex:1;">' + esc(c.summary) + '</div>'
        + '<div>' + liftBadges + '</div>'
        + '</div>'
        + '<div style="' + DS.muted + ';">' + c.postCount + ' posts · winner: ' + (platformIcons[c.dominantPlatform] || c.dominantPlatform) + ' (' + c.dominantMultiple.toFixed(2) + '× cluster median)</div>'
        + postRows
        + '</div>';
    }).join('');
    clustersHtml = '<div style="margin-bottom:24px;">'
      + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">'
      + '<h3 style="' + DS.sectionTitle + '; margin-bottom:0;">🔗 Cross-Platform Content Clusters</h3>'
      + '<span style="' + DS.muted + '">Same idea posted across platforms — see which format wins</span>'
      + '</div>'
      + '<div style="display:flex; flex-direction:column; gap:10px;">' + cards + '</div>'
      + '</div>';
  })();

  return `
    <div style="padding:4px 0;">
      <h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:20px;">📊 Data Hub</h2>
      ${summaryHtml}
      ${outliersHtml}
      ${clustersHtml}
      ${platformCardsHtml}
      ${beforeAfterHtml}
      ${chartsHtml}
      ${monthlyViewsHtml}
      ${postingFreqHtml}
      ${timelineHtml}
      ${waybackHtml}
    </div>
  `;
};

// ═══════════════════════════════════════════════════
// TAB: Content Library — All posts sorted, filterable
// ═══════════════════════════════════════════════════
//   POST-IDENTITY HELPERS — used wherever posts are listed
// ═══════════════════════════════════════════════════
// Mirror of api/lib/format-inference.js (browser-side, no import dependency).
// Returns codes like 'ig-reel', 'ig-carousel', 'tt-video' etc.
function inferFormatBrowser(post) {
  const platform = (post.platform || '').toLowerCase();
  const url = (post.url || '').toLowerCase();
  const rawType = (post.postType || post.type || post.media_type || '').toLowerCase();
  const productType = (post.media_product_type || '').toLowerCase();
  const thumbs = (post.thumbnails || post.images || []).length;
  if (platform === 'instagram' || url.includes('instagram.com')) {
    if (productType === 'reel' || url.includes('/reel/') || rawType === 'reel') return 'ig-reel';
    if (productType === 'story' || url.includes('/stories/')) return 'ig-story';
    if (rawType === 'carousel_album' || rawType === 'carousel' || thumbs > 1) return 'ig-carousel';
    if (rawType === 'image' || rawType === 'photo' || (url.includes('/p/') && rawType !== 'video')) return 'ig-static';
    return 'ig-reel';
  }
  if (platform === 'tiktok' || url.includes('tiktok.com')) {
    if (url.includes('/photo/') || rawType === 'photo') return 'tt-photo-carousel';
    return 'tt-video';
  }
  if (platform === 'linkedin' || url.includes('linkedin.com')) {
    if (rawType === 'video') return 'li-video';
    if (rawType === 'carousel') return 'li-carousel';
    return 'li-post';
  }
  if (platform === 'facebook' || url.includes('facebook.com')) {
    if (url.includes('/reel/')) return 'fb-reel';
    if (url.includes('/videos/')) return 'fb-video';
    if (url.includes('/photos/')) return 'fb-photo';
    return 'fb-post';
  }
  return 'other';
}
function shortFormatLabel(fmt) {
  return ({
    'ig-reel': 'Reel', 'ig-static': 'Static', 'ig-carousel': 'Carousel', 'ig-story': 'Story', 'ig-igtv': 'IGTV',
    'tt-video': 'Video', 'tt-photo-carousel': 'Photo carousel', 'tt-live': 'Live',
    'li-post': 'Post', 'li-article': 'Article', 'li-carousel': 'Carousel', 'li-video': 'Video', 'li-poll': 'Poll',
    'fb-post': 'Post', 'fb-photo': 'Photo', 'fb-video': 'Video', 'fb-reel': 'Reel', 'fb-story': 'Story',
  })[fmt] || fmt;
}
// Compress visual_style strings ("talking head with caption text overlay") to a tight label
function compressVisualStyle(s) {
  if (!s) return null;
  const x = s.toLowerCase();
  if (/talking head|talking-head|monologue|to.camera/.test(x)) return 'Talking head';
  if (/skit|sketch|comedy|reenact|act.out/.test(x)) return 'Skit';
  if (/voiceover|narrat|voice.over/.test(x)) return 'Voiceover';
  if (/asmr|sizzle|pour/.test(x)) return 'ASMR';
  if (/b.?roll|cinematic|montage/.test(x)) return 'B-roll';
  if (/text.only|quote.card|graphic|infographic/.test(x)) return 'Graphic';
  if (/vlog|day in/.test(x)) return 'Vlog';
  if (/interview|q.?a|conversation/.test(x)) return 'Interview';
  if (/duet|stitch|reaction/.test(x)) return 'Reaction';
  if (/announcement|notice|press/.test(x)) return 'Notice';
  return s.slice(0, 28); // fall through with a trim
}
function compressContentType(s) {
  if (!s) return null;
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 24);
}
function compressHookType(s) {
  if (!s) return null;
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 20);
}
// Build a readable "[date · format · identity]" tag block for a post
function postIdentityBadges(post, classByUrl) {
  const fmt = inferFormatBrowser(post);
  const fmtLabel = shortFormatLabel(fmt);
  const cls = classByUrl[post.url] || null;
  const identity = compressVisualStyle(cls?.visual_style) || compressContentType(cls?.content_type);
  const hook = compressHookType(cls?.hook_type);
  const dateStr = post.date ? (function() {
    const d = normalizeDate(post.date);
    if (!d) return post.date;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return parseInt(d.slice(8,10), 10) + ' ' + months[parseInt(d.slice(5,7),10)-1] + ' ' + d.slice(0,4);
  })() : null;
  const tag = (text, bg, color) => '<span style="font-size:10px; padding:2px 7px; border-radius:6px; background:' + bg + '; color:' + color + '; font-weight:600; white-space:nowrap;">' + text + '</span>';
  const parts = [];
  if (dateStr) parts.push(tag('📅 ' + dateStr, '#F1F5F9', '#475569'));
  parts.push(tag('🎬 ' + fmtLabel, '#EFF6FF', '#1D4ED8'));
  if (identity) parts.push(tag('🎤 ' + identity, '#FEF3C7', '#92400E'));
  if (hook) parts.push(tag('❓ ' + hook, '#F0FDF4', '#15803D'));
  return '<div style="display:flex; gap:4px; flex-wrap:wrap; margin:6px 0;">' + parts.join('') + '</div>';
}
window.postIdentityBadges = postIdentityBadges;
window.inferFormatBrowser = inferFormatBrowser;
window.shortFormatLabel = shortFormatLabel;

// ═══════════════════════════════════════════════════
// C1 — TAB: Hook Lab — Which opening hooks drive this client's biggest spikes
// ═══════════════════════════════════════════════════
// Uses the per-post classifications we built (hook_type, visual_style, retention)
// + posts-latest engagement data to rank hook formulas by lift over the client's
// own baseline. No LLM call needed at render time — all the labelling already
// happened during scrape (auto-classify) or backfill.
window.renderHookLab = function(d) {
  // We can be called with either the full client data object or the intel-data
  // sub-object. Try to normalise either way.
  const classifications = d?.classifications || d?.classByUrl || [];
  // Try to recover posts even when the caller only passed intelData
  let postsObj = d?.posts?.platforms;
  if (!postsObj && window._clientData?.posts?.platforms) postsObj = window._clientData.posts.platforms;
  if (!postsObj) postsObj = {};

  const classByUrl = {};
  for (const c of (Array.isArray(classifications) ? classifications : [])) {
    if (c.post_id) classByUrl[c.post_id] = c;
    if (c.url) classByUrl[c.url] = c;
  }

  // Flatten posts + attach classification
  const flat = [];
  for (const [pf, arr] of Object.entries(postsObj)) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      const cls = classByUrl[p.url];
      if (!cls?.hook_type || cls.hook_type === 'unknown') continue;
      flat.push({
        ...p,
        platform: pf,
        hook: cls.hook_type,
        content: cls.content_type,
        visual: cls.visual_style,
        retention: cls.estimated_retention_pct,
        eng: engScore(p),
        er: (p.views > 0) ? (engScore(p) / p.views) * 100 : null,
      });
    }
  }

  if (flat.length === 0) {
    return '<div style="padding:40px; ' + DS.muted + '; text-align:center;">No classified posts yet. Run scrape + classifier to surface hook patterns.</div>';
  }

  // Compute client baseline ER per platform (median of non-zero ER posts)
  const erByPlatform = {};
  for (const p of flat) {
    if (p.er == null) continue;
    if (!erByPlatform[p.platform]) erByPlatform[p.platform] = [];
    erByPlatform[p.platform].push(p.er);
  }
  const baselineER = {};
  for (const [pf, arr] of Object.entries(erByPlatform)) {
    const sorted = [...arr].sort((a, b) => a - b);
    baselineER[pf] = sorted[Math.floor(sorted.length / 2)] || 0;
  }

  // Aggregate by hook
  const byHook = {};
  for (const p of flat) {
    if (!byHook[p.hook]) byHook[p.hook] = { posts: [], totalEng: 0, totalViews: 0, retentions: [], lifts: [] };
    byHook[p.hook].posts.push(p);
    byHook[p.hook].totalEng += p.eng;
    byHook[p.hook].totalViews += (p.views || 0);
    if (p.retention) byHook[p.hook].retentions.push(p.retention);
    if (p.er != null && baselineER[p.platform] > 0) {
      byHook[p.hook].lifts.push(p.er / baselineER[p.platform]);
    }
  }

  const rows = Object.entries(byHook).map(([hook, g]) => {
    const avgER = g.totalViews > 0 ? (g.totalEng / g.totalViews) * 100 : null;
    const avgRetention = g.retentions.length > 0 ? (g.retentions.reduce((s, v) => s + v, 0) / g.retentions.length) : null;
    const avgLift = g.lifts.length > 0 ? (g.lifts.reduce((s, v) => s + v, 0) / g.lifts.length) : null;
    const best = [...g.posts].sort((a, b) => b.eng - a.eng)[0];
    return {
      hook,
      count: g.posts.length,
      avgER, avgRetention, avgLift,
      best,
    };
  }).sort((a, b) => (b.avgLift || 0) - (a.avgLift || 0));

  // Render
  const hookLabel = (h) => h.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const cards = rows.map((r, idx) => {
    const liftColour = r.avgLift > 1.2 ? '#16A34A' : r.avgLift > 0.8 ? '#3B82F6' : '#F59E0B';
    const liftBg = liftColour + '15';
    const liftText = r.avgLift != null ? r.avgLift.toFixed(2) + '× ER vs client baseline' : 'no view data';
    const bestCaption = (r.best?.caption || '').slice(0, 160);
    const bestPlatform = r.best?.platform || '';
    const bestPlatformIcon = platformIcons[bestPlatform] || '';
    const bestLink = r.best?.url ? '<a href="' + safeHref(r.best.url) + '" target="_blank" rel="noopener" style="color:' + DS.brand + ';font-size:11px;font-weight:600;">view ↗</a>' : '';
    const retentionBadge = r.avgRetention != null ? '<span style="font-size:11px;color:#475569;background:#F1F5F9;padding:2px 8px;border-radius:6px;">' + r.avgRetention.toFixed(0) + '% retention</span>' : '';
    const rankBadge = idx === 0 ? '<span style="font-size:10px;color:#16A34A;background:rgba(34,197,94,0.12);padding:2px 8px;border-radius:6px;font-weight:700;">🏆 TOP</span>' : '';
    return '<div style="' + DS.card + ';">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;">'
        + '<div style="flex:1;">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
            + '<h4 style="font-size:15px;font-weight:700;color:#1E293B;margin:0;">' + esc(hookLabel(r.hook)) + '</h4>'
            + rankBadge
            + '<span style="' + DS.muted + ';">' + r.count + ' post' + (r.count !== 1 ? 's' : '') + '</span>'
          + '</div>'
          + '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center;">'
            + '<span style="font-size:12px;font-weight:600;color:' + liftColour + ';background:' + liftBg + ';padding:2px 8px;border-radius:6px;">' + liftText + '</span>'
            + retentionBadge
            + (r.avgER != null ? '<span style="' + DS.muted + ';">' + r.avgER.toFixed(2) + '% avg ER</span>' : '')
          + '</div>'
        + '</div>'
      + '</div>'
      + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #F1F5F9;">'
        + '<div style="' + DS.label + ';margin-bottom:4px;">Best example · ' + bestPlatformIcon + ' ' + esc(fmtDate(r.best?.date)) + '</div>'
        + '<div style="font-size:13px;color:#475569;line-height:1.5;">' + esc(bestCaption) + (bestCaption.length >= 160 ? '…' : '') + '</div>'
        + (bestLink ? '<div style="margin-top:6px;">' + bestLink + '</div>' : '')
      + '</div>'
      + '</div>';
  }).join('');

  return '<div style="padding:4px 0;">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      + '<h2 style="font-size:20px;font-weight:700;color:#1E293B;margin:0;">🎣 Hook Lab</h2>'
      + '<span style="' + DS.muted + ';">Opening-hook formulas ranked by lift over this account\'s own baseline</span>'
    + '</div>'
    + '<div style="' + DS.muted + ';margin-bottom:20px;">Drawn from ' + flat.length + ' classified posts across all platforms. Higher lift = the hook pulls more engagement-per-view than this account\'s median post.</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px;">' + cards + '</div>'
    + '</div>';
};

window.renderContentLibrary = function(d) {
  // Build a URL→classification index once per render
  const classByUrl = {};
  for (const c of (d.classifications || [])) {
    if (c.post_id) classByUrl[c.post_id] = c;
    if (c.url) classByUrl[c.url] = c;
  }

  // Collect all client posts
  const allPosts = [];
  if (d.posts?.platforms) {
    for (const [platform, posts] of Object.entries(d.posts.platforms)) {
      for (const post of posts) {
        allPosts.push({ ...post, platform, source: 'client', engagement: engScore(post) });
      }
    }
  }

  // Collect competitor posts
  const compPosts = [];
  if (d.competitors?.competitors) {
    for (const comp of d.competitors.competitors) {
      if (comp.tiktok?.videos) {
        for (const v of comp.tiktok.videos) {
          compPosts.push({ ...v, platform: 'tiktok', source: 'competitor', sourceName: comp.name, engagement: engScore(v) });
        }
      }
      if (comp.instagram?.posts) {
        for (const p of comp.instagram.posts) {
          compPosts.push({ ...p, platform: 'instagram', source: 'competitor', sourceName: comp.name, engagement: engScore(p) });
        }
      }
    }
  }

  if (allPosts.length === 0 && compPosts.length === 0) {
    return '<div style="' + DS.muted + '; padding:40px; text-align:center;">No content data. Run the scraper first.</div>';
  }

  function renderPostCards(posts, title, showSource) {
    if (posts.length === 0) return '<p style="' + DS.muted + '">No ' + title.toLowerCase() + ' data available.</p>';

    const sorted = [...posts].sort((a, b) => (b.views || 0) - (a.views || 0));
    const avgEng = sorted.reduce((s, x) => s + (x.engagement || 0), 0) / sorted.length;

    return '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:16px; margin-bottom:24px;">'
      + sorted.map((p, i) => {
        const viewsVal = p.views || 0;
        const engVal = p.engagement || 0;
        const isFlop = engVal > 0 && engVal < (avgEng * 0.3);
        const isTop = i < 3 && engVal > 0;
        const badge = isTop ? '<span style="' + DS.greenDelta + '; font-size:10px;">🔥 TOP</span>'
          : isFlop ? '<span style="' + DS.redDelta + '; font-size:10px;">📉 FLOP</span>' : '';
        const icon = platformIcons[p.platform] || '';
        const color = platformColors[p.platform] || '#94A3B8';
        const caption = (p.caption || '').slice(0, 80);
        const postLink = p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener" style="color:' + DS.brand + '; text-decoration:none; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:4px; margin-top:8px;">View post ↗</a>' : '';
        const sourceTag = showSource ? '<div style="' + DS.muted + '; margin-top:4px;">From: ' + (p.sourceName || '—') + '</div>' : '';
        // ── A4 fix: per-post ER labels its denominator ──
        // If we have a view count, compute reach-based ER (engagement / views).
        // Without views, fall back to follower-based ER and label it estimated.
        const erMethod = viewsVal > 0 ? 'reach' : 'est';
        const engRate = viewsVal > 0
          ? ((engVal / viewsVal) * 100).toFixed(1)
          : '0';
        const engDot = parseFloat(engRate) >= 3 ? '🟢' : parseFloat(engRate) >= 1 ? '🟡' : '🔴';
        const erLabel = erMethod === 'reach' ? 'ER (reach)' : 'ER (est.)';
        const idBadges = window.postIdentityBadges ? window.postIdentityBadges(p, classByUrl) : '';

        // Thumbnail: use actual image if available, else gradient fallback
        const gradients = {
          instagram: 'linear-gradient(135deg, #E4405F22, #F77E3722)',
          tiktok: 'linear-gradient(135deg, #00000011, #69C9D022)',
          facebook: 'linear-gradient(135deg, #1877F222, #42B72A22)',
        };
        const thumbBg = gradients[p.platform] || 'linear-gradient(135deg, #F1F5F9, #E2E8F0)';
        const thumbUrl = p.thumbnail || p.thumbnailUrl || p.image || '';
        const thumbInner = thumbUrl
          ? '<img src="' + thumbUrl + '" style="width:100%; height:100%; object-fit:cover; border-radius:12px;" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" /><span style="font-size:28px; display:none; align-items:center; justify-content:center; width:100%; height:100%;">' + icon + '</span>'
          : '<span style="font-size:28px;">' + icon + '</span>';

        return '<div style="' + DS.card + '">'
          + '<div style="background:' + thumbBg + '; border-radius:12px; height:160px; display:flex; align-items:center; justify-content:center; margin-bottom:12px; position:relative; overflow:hidden;">'
          + thumbInner
          + '<div style="position:absolute; bottom:6px; left:6px; display:flex; gap:4px;">'
          + '<span style="background:' + color + '; color:#fff; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:600;">' + p.platform + '</span>'
          + (p.postType ? '<span style="background:#F1F5F9; color:#475569; padding:2px 6px; border-radius:6px; font-size:10px;">' + p.postType + '</span>' : '')
          + '</div>'
          + (badge ? '<div style="position:absolute; top:6px; right:6px;">' + badge + '</div>' : '')
          + '</div>'
          + idBadges
          + '<div style="font-size:13px; color:#475569; line-height:1.4; margin-bottom:10px; min-height:36px;">' + (caption || '—') + (caption.length >= 80 ? '...' : '') + '</div>'
          + '<div style="display:flex; gap:8px; font-size:12px; color:#94A3B8; flex-wrap:wrap; padding:8px 0; border-top:1px solid #F1F5F9; border-bottom:1px solid #F1F5F9;">'
          + '<span>👁 ' + fmt(viewsVal) + '</span>'
          + '<span>❤️ ' + fmt(p.likes || 0) + '</span>'
          + '<span>💬 ' + (p.comments || 0) + '</span>'
          + (p.shares ? '<span>🔄 ' + p.shares + '</span>' : '')
          + (p.saves ? '<span>🔖 ' + p.saves + '</span>' : '')
          + '</div>'
          + '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">'
          + '<span title="' + (erMethod === 'reach' ? 'engagement / views (post reach denominator)' : 'no view count returned — defaulting to follower-based estimate') + '" style="font-size:12px; color:#475569; cursor:help;">' + erLabel + ': ' + engRate + '% ' + engDot + '</span>'
          + '</div>'
          + sourceTag
          + postLink
          + '</div>';
      }).join('')
      + '</div>';
  }

  // Store render function for filter handler
  window.renderContentLibrary.__renderTable = function(posts) {
    return renderPostCards(posts, 'Client content', false);
  };

  // Platform filter tabs
  const clientByPlatform = {};
  for (const p of allPosts) {
    if (!clientByPlatform[p.platform]) clientByPlatform[p.platform] = [];
    clientByPlatform[p.platform].push(p);
  }

  let platformTabs = `
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      <button class="tab active" data-lib-filter="all" onclick="window._libFilter(this,'all')" style="${DS.btnPrimary}; padding:6px 16px; font-size:12px; border-radius:20px;">All (${allPosts.length})</button>
      ${Object.entries(clientByPlatform).map(([k, v]) =>
        `<button class="tab" data-lib-filter="${k}" onclick="window._libFilter(this,'${k}')" style="${DS.btnSecondary}; padding:6px 16px; font-size:12px; border-radius:20px;">${platformIcons[k] || ''} ${k} (${v.length})</button>`
      ).join('')}
    </div>
  `;

  return `
    <div style="padding:4px 0;">
      <h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:20px;">📚 Content Library</h2>

      <h3 style="${DS.sectionTitle}">Your Content</h3>
      ${platformTabs}
      <div id="lib-client-table">
        ${renderPostCards(allPosts, 'Client content', false)}
      </div>

      ${compPosts.length > 0 ? `
        <h3 style="${DS.sectionTitle}; margin-top:32px; color:${DS.brand};">🕵️ Competitor Content</h3>
        ${renderPostCards(compPosts, 'Competitor content', true)}
      ` : '<p style="' + DS.muted + '; margin-top:24px;">No competitor content data. Scrape competitors from the AI Analysis tab.</p>'}
    </div>
  `;
};

// Filter handler for content library platform tabs
window._libFilter = function(btn, platform) {
  // Update active state
  btn.parentElement.querySelectorAll('.tab').forEach(t => {
    t.style.background = '#fff';
    t.style.color = '#475569';
    t.style.border = '1px solid #E2E8F0';
    t.classList.remove('active');
  });
  btn.style.background = DS.brand;
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.classList.add('active');

  const tableEl = document.getElementById('lib-client-table');
  if (!tableEl || !window._clientData?.posts?.platforms) return;

  const posts = [];
  for (const [p, pPosts] of Object.entries(window._clientData.posts.platforms)) {
    if (platform !== 'all' && p !== platform) continue;
    for (const post of pPosts) {
      posts.push({ ...post, platform: p, source: 'client', engagement: engScore(post) });
    }
  }
  tableEl.innerHTML = window.renderContentLibrary.__renderTable(posts);
};

// ═══════════════════════════════════════════════════
// TAB: Scorecard — Performance + Competitor Intelligence
// ═══════════════════════════════════════════════════
window.renderScorecard = function(d) {
  const platforms = d.metrics?.platforms || {};
  const posts = d.posts?.platforms || {};
  const competitors = d.competitors?.competitors || [];
  const history = d.history?.scrapeHistory || d.history?.snapshots || [];

  // Collect all client posts with engagement
  const allPosts = [];
  for (const [platform, pPosts] of Object.entries(posts)) {
    for (const post of pPosts) {
      allPosts.push({ ...post, platform, engagement: engScore(post) });
    }
  }

  // Top 3 and Bottom 3
  const sorted = [...allPosts].sort((a, b) => b.engagement - a.engagement);
  const top3 = sorted.slice(0, 3);
  const flops = sorted.filter(p => p.engagement > 0).slice(-3).reverse();

  function postCard(p, label, labelColor) {
    const icon = platformIcons[p.platform] || '';
    const color = platformColors[p.platform] || '#94A3B8';
    return `
      <div style="${DS.card}; border-left:4px solid ${labelColor};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="color:${color}; font-size:13px; font-weight:600;">${icon} ${p.platform}</span>
          <span style="color:${labelColor}; font-size:11px; font-weight:700; background:${labelColor}11; padding:2px 8px; border-radius:10px;">${label}</span>
        </div>
        <div style="color:#475569; font-size:13px; margin-bottom:10px; line-height:1.4;">${(p.caption || '').slice(0, 100)}${(p.caption || '').length > 100 ? '...' : ''}</div>
        <div style="display:flex; gap:10px; font-size:12px; color:#94A3B8; flex-wrap:wrap;">
          ${p.views ? '<span>👁️ ' + fmt(p.views) + '</span>' : ''}
          <span>❤️ ${fmt(p.likes || 0)}</span>
          <span>💬 ${p.comments || 0}</span>
          ${p.shares ? '<span>🔄 ' + p.shares + '</span>' : ''}
        </div>
        <div style="color:${DS.brand}; font-size:14px; font-weight:700; margin-top:8px; padding-top:8px; border-top:1px solid #F1F5F9;">${fmt(p.engagement)} total engagement</div>
      </div>
    `;
  }

  // ── Visual Ranking Bar (client vs competitors) ──
  let rankingBarHtml = '';
  if (competitors.length > 0) {
    const clientTTAvgViewsForRank = (() => {
      const ttPosts = posts.tiktok || [];
      if (ttPosts.length === 0) return 0;
      return Math.round(ttPosts.reduce((s, p) => s + (p.views || 0), 0) / ttPosts.length);
    })();

    const rankEntries = [
      { name: 'You (Client)', value: clientTTAvgViewsForRank, isClient: true },
      ...competitors.map(c => ({ name: c.name, value: c.tiktok?.avgViews || 0, isClient: false }))
    ].sort((a, b) => b.value - a.value);

    const maxVal = rankEntries[0]?.value || 1;

    rankingBarHtml = `
      <div style="${DS.card}; margin-bottom:24px;">
        <h3 style="${DS.sectionTitle}">📊 Visual Ranking — Average TikTok Views</h3>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${rankEntries.map(e => {
            const barPct = Math.max(3, (e.value / maxVal) * 100);
            const barColor = e.isClient ? DS.brand : '#CBD5E1';
            const textColor = e.isClient ? DS.brand : '#475569';
            return '<div style="display:flex; align-items:center; gap:12px;">'
              + '<span style="min-width:140px; font-size:13px; font-weight:' + (e.isClient ? '700' : '500') + '; color:' + textColor + '; text-align:right; white-space:nowrap;">' + e.name + '</span>'
              + '<div style="flex:1; height:24px; background:#F1F5F9; border-radius:6px; overflow:hidden;">'
              + '<div style="height:100%; width:' + barPct + '%; background:' + barColor + '; border-radius:6px; transition:width 0.5s;"></div>'
              + '</div>'
              + '<span style="min-width:55px; font-size:12px; font-weight:600; color:' + textColor + '; text-align:right; white-space:nowrap;">' + fmt(e.value) + '</span>'
              + '</div>';
          }).join('')}
        </div>
      </div>
    `;
  }

  // ── McKinsey-style Intel Renderer ──
  function renderMcKinseyIntel(s) {
    var tierColors = { dominant: '#7C5CFC', strong: '#22C55E', average: '#F59E0B', weak: '#EF4444' };
    var tierLabels = { dominant: 'DOMINANT', strong: 'STRONG', average: 'AVERAGE', weak: 'WEAK' };
    var e = esc; // shorthand

    // — Executive Summary banner
    var html = '<div style="margin-top:20px;">';
    html += '<div style="' + DS.card + '; border-left:4px solid #7C5CFC; margin-bottom:20px;">';
    html += '<div style="' + DS.label + '; margin-bottom:6px;">EXECUTIVE SUMMARY</div>';
    html += '<p style="font-size:14px; color:#1E293B; line-height:1.6; margin:0;">' + e(s.executive_summary) + '</p>';
    if (s.client_position) {
      html += '<div style="display:flex; gap:16px; margin-top:12px; flex-wrap:wrap;">';
      html += '<span style="' + DS.grayDelta + '; font-size:12px;">Rank: ' + e(s.client_position.rank) + ' of ' + e(s.client_position.total_tracked) + '</span>';
      html += '<span style="font-size:13px; font-weight:600; color:#475569;">' + e(s.client_position.verdict) + '</span>';
      html += '</div>';
    }
    html += '</div>';

    // — Competitor Landscape (horizontal bar chart + cards)
    if (s.competitors && s.competitors.length > 0) {
      var maxViews = Math.max.apply(null, s.competitors.map(function(c) { return c.avg_views || 0; }));

      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">COMPETITIVE LANDSCAPE</div>';
      html += '<div style="' + DS.card + '; margin-bottom:20px; padding:20px;">';

      // Horizontal bar chart
      html += '<div style="margin-bottom:24px;">';
      var sortedComps = s.competitors.slice().sort(function(a, b) { return (b.avg_views || 0) - (a.avg_views || 0); });
      sortedComps.forEach(function(c) {
        var pct = maxViews > 0 ? Math.min(100, Math.round(((c.avg_views || 0) / maxViews) * 100)) : 0;
        var tc = tierColors[c.tier] || '#94A3B8';
        html += '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">';
        html += '<span style="min-width:140px; font-size:12px; font-weight:600; color:#1E293B; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + e(c.name) + '</span>';
        html += '<div style="flex:1; height:20px; background:#F1F5F9; border-radius:4px; overflow:hidden; position:relative;">';
        html += '<div style="height:100%; width:' + pct + '%; background:' + tc + '; border-radius:4px; transition:width 0.6s ease;"></div>';
        html += '</div>';
        html += '<span style="min-width:70px; font-size:12px; font-weight:700; color:#1E293B; font-family:\'JetBrains Mono\',monospace;">' + fmt(c.avg_views || 0) + '</span>';
        html += '<span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; color:#fff; background:' + tc + '; letter-spacing:0.05em;">' + (tierLabels[c.tier] || 'N/A') + '</span>';
        html += '</div>';
      });
      html += '</div>';

      // Individual competitor cards (2-column grid)
      html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;">';
      sortedComps.forEach(function(c) {
        var tc = tierColors[c.tier] || '#94A3B8';
        var mult = c.views_vs_client || 0;
        var multLabel = mult >= 1 ? mult.toFixed(1) + 'x client' : (mult > 0 ? (mult * 100).toFixed(0) + '% of client' : '—');
        html += '<div style="border:1px solid #F1F5F9; border-radius:12px; padding:16px; border-top:3px solid ' + tc + ';">';
        // Header
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">';
        html += '<span style="font-size:14px; font-weight:700; color:#1E293B;">' + e(c.name) + '</span>';
        html += '<span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; color:#fff; background:' + tc + ';">' + (tierLabels[c.tier] || '') + '</span>';
        html += '</div>';
        // Metrics row
        html += '<div style="display:flex; gap:16px; margin-bottom:12px;">';
        html += '<div><span style="' + DS.label + '">AVG VIEWS</span><div style="font-size:18px; font-weight:700; color:#1E293B; font-family:\'JetBrains Mono\',monospace;">' + fmt(c.avg_views || 0) + '</div></div>';
        html += '<div><span style="' + DS.label + '">AVG ENG</span><div style="font-size:18px; font-weight:700; color:#1E293B; font-family:\'JetBrains Mono\',monospace;">' + fmt(c.avg_engagement || 0) + '</div></div>';
        html += '<div><span style="' + DS.label + '">VS CLIENT</span><div style="font-size:14px; font-weight:600; color:' + (mult > 1 ? '#EF4444' : '#22C55E') + ';">' + multLabel + '</div></div>';
        html += '</div>';
        // Formula
        if (c.winning_formula) {
          html += '<div style="font-size:12px; color:#475569; font-style:italic; margin-bottom:10px; padding:8px; background:#F8FAFC; border-radius:6px;">"' + e(c.winning_formula) + '"</div>';
        }
        // Strengths
        if (c.key_strengths && c.key_strengths.length) {
          html += '<div style="margin-bottom:8px;">';
          html += '<span style="' + DS.label + '; color:#22C55E;">STRENGTHS</span>';
          c.key_strengths.forEach(function(st) {
            html += '<div style="font-size:12px; color:#475569; padding:2px 0; display:flex; gap:4px; align-items:baseline;"><span style="color:#22C55E;">+</span> ' + e(st) + '</div>';
          });
          html += '</div>';
        }
        // What to steal
        if (c.what_client_can_steal && c.what_client_can_steal.length) {
          html += '<div>';
          html += '<span style="' + DS.label + '; color:#7C5CFC;">STEAL THIS</span>';
          c.what_client_can_steal.forEach(function(st) {
            html += '<div style="font-size:12px; color:#475569; padding:2px 0; display:flex; gap:4px; align-items:baseline;"><span style="color:#7C5CFC;">→</span> ' + e(st) + '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    // — Format Rankings (horizontal bar chart)
    if (s.format_rankings && s.format_rankings.length > 0) {
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">CONTENT FORMAT EFFECTIVENESS</div>';
      html += '<div style="' + DS.card + '; margin-bottom:20px; padding:20px;">';
      s.format_rankings.forEach(function(f) {
        var eff = Math.min(100, Math.max(0, f.effectiveness || 0));
        var barColor = eff >= 75 ? '#22C55E' : eff >= 50 ? '#F59E0B' : '#EF4444';
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">';
        html += '<span style="font-size:13px; font-weight:600; color:#1E293B;">' + e(f.format) + '</span>';
        html += '<span style="font-size:12px; color:#94A3B8;">' + (f.best_used_by || []).map(e).join(', ') + '</span>';
        html += '</div>';
        html += '<div style="height:8px; background:#F1F5F9; border-radius:4px; overflow:hidden;">';
        html += '<div style="height:100%; width:' + eff + '%; background:' + barColor + '; border-radius:4px; transition:width 0.4s ease;"></div>';
        html += '</div>';
        if (f.why) {
          html += '<div style="font-size:11px; color:#94A3B8; margin-top:2px;">' + e(f.why) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // — Topic Rankings (horizontal bar chart)
    if (s.topic_rankings && s.topic_rankings.length > 0) {
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">TOPIC VIRALITY INDEX</div>';
      html += '<div style="' + DS.card + '; margin-bottom:20px; padding:20px;">';
      s.topic_rankings.forEach(function(t) {
        var vs = Math.min(100, Math.max(0, t.virality_score || 0));
        var barColor = vs >= 75 ? '#7C5CFC' : vs >= 50 ? '#A78BFA' : '#CBD5E1';
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">';
        html += '<span style="font-size:13px; font-weight:600; color:#1E293B;">' + e(t.topic) + '</span>';
        html += '<span style="font-size:12px; font-weight:700; color:#1E293B; font-family:\'JetBrains Mono\',monospace;">' + vs + '</span>';
        html += '</div>';
        html += '<div style="height:8px; background:#F1F5F9; border-radius:4px; overflow:hidden;">';
        html += '<div style="height:100%; width:' + vs + '%; background:' + barColor + '; border-radius:4px; transition:width 0.4s ease;"></div>';
        html += '</div>';
        if (t.why) {
          html += '<div style="font-size:11px; color:#94A3B8; margin-top:2px;">' + e(t.why) + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // — Gap Analysis (highlight card)
    if (s.gap_analysis) {
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">GAP ANALYSIS</div>';
      html += '<div style="' + DS.card + '; border-left:4px solid #EF4444; margin-bottom:20px;">';
      if (s.gap_analysis.missing_formats && s.gap_analysis.missing_formats.length) {
        html += '<div style="margin-bottom:12px;">';
        html += '<span style="' + DS.label + '; color:#EF4444;">MISSING FORMATS</span>';
        html += '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">';
        s.gap_analysis.missing_formats.forEach(function(f) {
          html += '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(239,68,68,0.08); color:#EF4444; border:1px solid rgba(239,68,68,0.2);">' + e(f) + '</span>';
        });
        html += '</div></div>';
      }
      if (s.gap_analysis.missing_topics && s.gap_analysis.missing_topics.length) {
        html += '<div style="margin-bottom:12px;">';
        html += '<span style="' + DS.label + '; color:#F59E0B;">MISSING TOPICS</span>';
        html += '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">';
        s.gap_analysis.missing_topics.forEach(function(t) {
          html += '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(245,158,11,0.08); color:#F59E0B; border:1px solid rgba(245,158,11,0.2);">' + e(t) + '</span>';
        });
        html += '</div></div>';
      }
      if (s.gap_analysis.strategic_recommendation) {
        html += '<div style="margin-top:12px; padding:12px; background:#F8FAFC; border-radius:8px;">';
        html += '<span style="' + DS.label + ';">STRATEGIC RECOMMENDATION</span>';
        html += '<p style="font-size:13px; color:#1E293B; line-height:1.6; margin:6px 0 0 0; font-weight:500;">' + e(s.gap_analysis.strategic_recommendation) + '</p>';
        html += '</div>';
      }
      html += '</div>';
    }

    // — Spotlight Analyses (deep-dive cards)
    if (s.spotlight_analyses && s.spotlight_analyses.length > 0) {
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">SPOTLIGHT DEEP-DIVES</div>';
      s.spotlight_analyses.forEach(function(sp) {
        html += '<div style="' + DS.card + '; margin-bottom:16px; border-left:4px solid #7C5CFC;">';
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
        html += '<span style="font-size:15px; font-weight:700; color:#1E293B;">' + e(sp.name) + '</span>';
        html += '<span style="font-size:12px; font-weight:700; color:#7C5CFC; font-family:\'JetBrains Mono\',monospace;">' + fmt(sp.avg_views || 0) + ' avg views · ' + (sp.multiplier_vs_client || 0).toFixed(1) + 'x client</span>';
        html += '</div>';
        if (sp.formula_title) {
          html += '<div style="font-size:13px; font-weight:700; color:#7C5CFC; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">' + e(sp.formula_title) + '</div>';
        }
        if (sp.formula_points && sp.formula_points.length) {
          sp.formula_points.forEach(function(pt) {
            html += '<div style="font-size:13px; color:#475569; padding:3px 0; display:flex; gap:6px; align-items:baseline; line-height:1.5;"><span style="color:#7C5CFC; font-weight:700;">›</span> ' + e(pt) + '</div>';
          });
        }
        if (sp.what_to_copy) {
          html += '<div style="margin-top:10px; padding:10px 12px; background:rgba(124,92,252,0.06); border-radius:8px; font-size:12px; color:#1E293B;">';
          html += '<span style="font-weight:700; color:#7C5CFC;">STEAL THIS →</span> ' + e(sp.what_to_copy);
          html += '</div>';
        }
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  // ── Brand Strategy Report Renderer ──
  function renderBrandReport(s) {
    var e = esc;
    var html = '<div style="margin-top:20px;">';

    // — Title bar
    html += '<div style="' + DS.card + '; border-left:4px solid #7C5CFC; margin-bottom:20px;">';
    html += '<div style="font-size:18px; font-weight:700; color:#1E293B; margin-bottom:4px;">' + e(s.report_title || 'Brand Strategy Report') + '</div>';
    html += '<div style="font-size:12px; color:#94A3B8;">Generated ' + e(s.generated_date || '') + '</div>';
    html += '</div>';

    // — 1. Brand Identity
    if (s.brand_identity) {
      var bi = s.brand_identity;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">BRAND IDENTITY</div>';
      html += '<div style="' + DS.card + '; margin-bottom:16px;">';
      html += '<p style="font-size:14px; color:#1E293B; line-height:1.6; margin-bottom:12px;">' + e(bi.summary) + '</p>';
      html += '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">';
      html += '<div style="background:#fff; border:1px solid #F1F5F9; border-radius:10px; padding:12px 20px; text-align:center;">';
      html += '<div style="font-size:24px; font-weight:700; color:#7C5CFC; font-family:\'JetBrains Mono\',monospace;">' + e(bi.brand_consistency_score) + '/10</div>';
      html += '<div style="font-size:11px; color:#94A3B8; text-transform:uppercase;">Consistency</div></div>';
      html += '<div style="background:#fff; border:1px solid #F1F5F9; border-radius:10px; padding:12px 20px; text-align:center;">';
      html += '<div style="font-size:16px; font-weight:700; color:#7C5CFC;">' + e(bi.brand_archetype) + '</div>';
      html += '<div style="font-size:11px; color:#94A3B8; text-transform:uppercase;">Archetype</div></div>';
      html += '</div>';
      if (bi.brand_personality_traits && bi.brand_personality_traits.length) {
        html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Personality</span><div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">';
        bi.brand_personality_traits.forEach(function(t) { html += '<span style="display:inline-block; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(124,92,252,0.1); color:#7C5CFC;">' + e(t) + '</span>'; });
        html += '</div></div>';
      }
      if (bi.visual_identity_notes) html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Visual Identity</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(bi.visual_identity_notes) + '</p></div>';
      if (bi.brand_consistency_notes) html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Consistency Notes</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(bi.brand_consistency_notes) + '</p></div>';
      html += '</div>';
    }

    // — 2. Tone & Pacing
    if (s.tone_and_pacing) {
      var tp = s.tone_and_pacing;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">TONE & PACING</div>';
      html += '<div style="' + DS.card + '; margin-bottom:16px;">';
      html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">';
      html += '<div><span style="' + DS.label + '">Overall Tone</span><p style="font-size:15px; font-weight:600; color:#1E293B; margin-top:4px;">' + e(tp.overall_tone) + '</p></div>';
      html += '<div><span style="' + DS.label + '">Pacing Style</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(tp.pacing_style) + '</p></div>';
      html += '</div>';
      if (tp.optimal_duration_range) html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Optimal Duration</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(tp.optimal_duration_range) + '</p></div>';
      if (tp.hook_style) html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Hook Style</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(tp.hook_style) + '</p></div>';
      if (tp.retention_patterns) html += '<div><span style="' + DS.label + '">Retention Patterns</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(tp.retention_patterns) + '</p></div>';
      html += '</div>';
      if (tp.tone_variations && tp.tone_variations.length) {
        html += '<div style="overflow-x:auto; margin-bottom:16px;"><table style="width:100%; border-collapse:collapse;">';
        html += '<thead><tr><th style="' + DS.th + '">Platform</th><th style="' + DS.th + '">Tone</th><th style="' + DS.th + '">Notes</th></tr></thead><tbody>';
        tp.tone_variations.forEach(function(v) { html += '<tr><td style="' + DS.td + '">' + e(v.platform) + '</td><td style="' + DS.td + ' font-weight:600;">' + e(v.tone) + '</td><td style="' + DS.td + '">' + e(v.notes) + '</td></tr>'; });
        html += '</tbody></table></div>';
      }
    }

    // — 3. Edit Style Guide
    if (s.edit_style_guide) {
      var es = s.edit_style_guide;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">EDIT STYLE GUIDE</div>';
      html += '<div style="' + DS.card + '; margin-bottom:16px;">';
      html += '<div style="margin-bottom:12px;"><span style="' + DS.label + '">Current Style</span><p style="font-size:13px; color:#475569; margin-top:4px;">' + e(es.current_style) + '</p></div>';
      html += '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">';
      html += '<div><span style="' + DS.label + '">Production Tier</span><div style="margin-top:4px;"><span style="display:inline-block; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(124,92,252,0.1); color:#7C5CFC;">' + e(es.production_tier) + '</span></div></div>';
      if (es.thumbnail_strategy) html += '<div><span style="' + DS.label + '">Thumbnail Strategy</span><p style="font-size:12px; color:#475569; margin-top:4px;">' + e(es.thumbnail_strategy) + '</p></div>';
      html += '</div>';
      if (es.recommended_transitions && es.recommended_transitions.length) {
        html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Recommended Transitions</span><div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">';
        es.recommended_transitions.forEach(function(t) { html += '<span style="display:inline-block; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(34,197,94,0.08); color:#22C55E;">' + e(t) + '</span>'; });
        html += '</div></div>';
      }
      if (es.text_overlay_usage) html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Text Overlays</span><p style="font-size:12px; color:#475569; margin-top:4px;">' + e(es.text_overlay_usage) + '</p></div>';
      if (es.music_and_sound) html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">Music & Sound</span><p style="font-size:12px; color:#475569; margin-top:4px;">' + e(es.music_and_sound) + '</p></div>';
      if (es.b_roll_recommendations) html += '<div style="margin-bottom:8px;"><span style="' + DS.label + '">B-Roll</span><p style="font-size:12px; color:#475569; margin-top:4px;">' + e(es.b_roll_recommendations) + '</p></div>';
      if (es.production_recommendations) html += '<div style="margin-top:12px; padding:12px; background:#F8FAFC; border-radius:8px; border-left:3px solid #7C5CFC;"><span style="' + DS.label + '">Production Improvements</span><p style="font-size:13px; color:#1E293B; font-weight:500; margin-top:4px;">' + e(es.production_recommendations) + '</p></div>';
      html += '</div>';
    }

    // — 4. Target Audience / ICP
    if (s.target_audience) {
      var ta = s.target_audience;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">TARGET AUDIENCE & ICP</div>';
      html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">';
      // Primary ICP
      if (ta.primary_icp) {
        html += '<div style="' + DS.card + '; border-left:4px solid #7C5CFC;">';
        html += '<span style="' + DS.label + '; color:#7C5CFC;">PRIMARY ICP</span>';
        html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Demographic</span><p style="font-size:13px; margin-top:2px;">' + e(ta.primary_icp.demographic) + '</p></div>';
        html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Psychographic</span><p style="font-size:13px; color:#475569; margin-top:2px;">' + e(ta.primary_icp.psychographic) + '</p></div>';
        if (ta.primary_icp.pain_points && ta.primary_icp.pain_points.length) {
          html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Pain Points</span>';
          ta.primary_icp.pain_points.forEach(function(p) { html += '<div style="font-size:12px; color:#475569; padding:2px 0;">• ' + e(p) + '</div>'; });
          html += '</div>';
        }
        if (ta.primary_icp.content_preferences) html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Content Preferences</span><p style="font-size:12px; color:#475569; margin-top:2px;">' + e(ta.primary_icp.content_preferences) + '</p></div>';
        html += '</div>';
      }
      // Secondary ICP
      if (ta.secondary_icp) {
        html += '<div style="' + DS.card + '">';
        html += '<span style="' + DS.label + '">SECONDARY ICP</span>';
        html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Demographic</span><p style="font-size:13px; margin-top:2px;">' + e(ta.secondary_icp.demographic) + '</p></div>';
        html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Psychographic</span><p style="font-size:13px; color:#475569; margin-top:2px;">' + e(ta.secondary_icp.psychographic) + '</p></div>';
        if (ta.secondary_icp.pain_points && ta.secondary_icp.pain_points.length) {
          html += '<div style="margin-top:8px;"><span style="' + DS.label + '">Pain Points</span>';
          ta.secondary_icp.pain_points.forEach(function(p) { html += '<div style="font-size:12px; color:#475569; padding:2px 0;">• ' + e(p) + '</div>'; });
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      if (ta.audience_gap) {
        html += '<div style="' + DS.card + '; border-left:4px solid #EF4444; margin-bottom:16px;">';
        html += '<span style="' + DS.label + '; color:#EF4444;">AUDIENCE GAP</span>';
        html += '<p style="font-size:13px; color:#1E293B; margin-top:4px;">' + e(ta.audience_gap) + '</p>';
        html += '</div>';
      }
    }

    // — 5. USP & Contrarian Angles
    if (s.usp_and_contrarian_angles) {
      var usp = s.usp_and_contrarian_angles;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">USP & CONTRARIAN ANGLES</div>';
      html += '<div style="' + DS.card + '; border-left:4px solid #7C5CFC; margin-bottom:16px;">';
      html += '<span style="' + DS.label + '">Current USP</span>';
      html += '<p style="font-size:14px; font-weight:500; color:#1E293B; margin-top:4px;">' + e(usp.current_usp) + '</p>';
      html += '</div>';

      // Contrarian beliefs
      if (usp.contrarian_beliefs && usp.contrarian_beliefs.length) {
        html += '<div style="' + DS.label + '; margin-bottom:8px;">CONTRARIAN BELIEFS TO WEAPONISE</div>';
        usp.contrarian_beliefs.forEach(function(b) {
          html += '<div style="' + DS.card + '; margin-bottom:10px;">';
          html += '<p style="font-size:14px; font-weight:600; color:#1E293B; margin-bottom:6px;">' + e(b.belief) + '</p>';
          html += '<p style="font-size:12px; color:#475569; margin-bottom:8px;">' + e(b.why_it_works) + '</p>';
          html += '<span style="display:inline-block; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(124,92,252,0.1); color:#7C5CFC;">' + e(b.content_format) + '</span>';
          if (b.example_hook) html += '<div style="background:#fff; border:1px solid #E2E8F0; border-radius:8px; padding:10px 14px; margin-top:8px; font-size:13px; font-style:italic; color:#475569;">"' + e(b.example_hook) + '"</div>';
          html += '</div>';
        });
      }

      // Trend-jacking
      if (usp.trend_jacking_opportunities && usp.trend_jacking_opportunities.length) {
        html += '<div style="' + DS.label + '; margin-bottom:8px; margin-top:16px;">TREND-JACKING OPPORTUNITIES</div>';
        html += '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;">';
        html += '<thead><tr><th style="' + DS.th + '">Trend</th><th style="' + DS.th + '">Your Twist</th><th style="' + DS.th + '">Format</th><th style="' + DS.th + '">Urgency</th></tr></thead><tbody>';
        usp.trend_jacking_opportunities.forEach(function(t) {
          var urgColor = t.urgency === 'high' ? '#EF4444' : t.urgency === 'low' ? '#22C55E' : '#F59E0B';
          html += '<tr><td style="' + DS.td + ' font-weight:600;">' + e(t.trend) + '</td><td style="' + DS.td + '">' + e(t.twist) + '</td><td style="' + DS.td + '">' + e(t.format) + '</td><td style="' + DS.td + '"><span style="color:' + urgColor + '; font-weight:700;">' + e(t.urgency) + '</span></td></tr>';
        });
        html += '</tbody></table></div>';
      }

      // Frameworks to steal
      if (usp.frameworks_to_steal && usp.frameworks_to_steal.length) {
        html += '<div style="' + DS.label + '; margin-bottom:8px; margin-top:16px;">FRAMEWORKS TO STEAL & ADAPT</div>';
        usp.frameworks_to_steal.forEach(function(f) {
          html += '<div style="' + DS.card + '; margin-bottom:8px;">';
          html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
          html += '<span style="font-size:14px; font-weight:600; color:#1E293B;">' + e(f.framework) + '</span>';
          html += '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(245,158,11,0.08); color:#F59E0B;">from ' + e(f.competitor) + '</span>';
          html += '</div>';
          html += '<p style="font-size:12px; color:#475569; margin-top:6px;">' + e(f.adaptation) + '</p>';
          html += '</div>';
        });
      }
    }

    // — 6. Weakness Breakdown
    if (s.weakness_breakdown) {
      var wb = s.weakness_breakdown;
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">WEAKNESS BREAKDOWN & ACTIONABLES</div>';

      if (wb.critical_weaknesses && wb.critical_weaknesses.length) {
        html += '<div style="' + DS.label + '; margin-bottom:6px; color:#EF4444;">CRITICAL WEAKNESSES</div>';
        wb.critical_weaknesses.forEach(function(w) {
          var impactColor = w.impact === 'high' ? '#EF4444' : w.impact === 'low' ? '#22C55E' : '#F59E0B';
          html += '<div style="' + DS.card + '; border-left:4px solid #EF4444; margin-bottom:10px;">';
          html += '<div style="display:flex; justify-content:space-between; margin-bottom:6px;">';
          html += '<span style="font-size:14px; font-weight:600; color:#1E293B;">' + e(w.weakness) + '</span>';
          html += '<span style="color:' + impactColor + '; font-weight:700; font-size:12px;">' + e(w.impact) + ' impact</span>';
          html += '</div>';
          html += '<p style="font-size:12px; color:#475569; margin-bottom:6px;"><strong>Evidence:</strong> ' + e(w.evidence) + '</p>';
          html += '<p style="font-size:13px; color:#1E293B; font-weight:500; padding:8px 12px; background:#F8FAFC; border-radius:6px;">→ ' + e(w.actionable) + '</p>';
          html += '</div>';
        });
      }

      if (wb.competitive_disadvantages && wb.competitive_disadvantages.length) {
        html += '<div style="' + DS.label + '; margin-bottom:6px; margin-top:16px;">COMPETITIVE DISADVANTAGES</div>';
        html += '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;">';
        html += '<thead><tr><th style="' + DS.th + '">Area</th><th style="' + DS.th + '">Gap</th><th style="' + DS.th + '">Benchmark</th><th style="' + DS.th + '">Catch-Up Plan</th></tr></thead><tbody>';
        wb.competitive_disadvantages.forEach(function(d) {
          html += '<tr><td style="' + DS.td + ' font-weight:600;">' + e(d.area) + '</td><td style="' + DS.td + '">' + e(d.gap_size) + '</td><td style="' + DS.td + '">' + e(d.benchmark_competitor) + '</td><td style="' + DS.td + '">' + e(d.catch_up_plan) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }

      if (wb.quick_wins && wb.quick_wins.length) {
        html += '<div style="' + DS.label + '; margin-bottom:6px; margin-top:16px; color:#22C55E;">QUICK WINS</div>';
        wb.quick_wins.forEach(function(q) {
          html += '<div style="' + DS.card + '; border-left:4px solid #22C55E; margin-bottom:8px;">';
          html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
          html += '<span style="font-size:14px; font-weight:600; color:#1E293B;">' + e(q.action) + '</span>';
          html += '<div><span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(34,197,94,0.08); color:#22C55E; margin-right:4px;">' + e(q.effort) + ' effort</span>';
          html += '<span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(245,158,11,0.08); color:#F59E0B;">' + e(q.timeline) + '</span></div>';
          html += '</div>';
          html += '<p style="font-size:12px; color:#475569; margin-top:4px;">' + e(q.expected_impact) + '</p>';
          html += '</div>';
        });
      }
    }

    // — 7. Content Calendar Seeds
    if (s.content_calendar_seeds && s.content_calendar_seeds.length) {
      html += '<div style="' + DS.label + '; margin-bottom:10px; margin-top:28px;">CONTENT CALENDAR SEEDS</div>';
      s.content_calendar_seeds.forEach(function(w) {
        html += '<div style="' + DS.card + '; margin-bottom:12px;">';
        html += '<div style="' + DS.label + '; margin-bottom:8px;">WEEK ' + w.week + ' — ' + e(w.theme) + '</div>';
        html += '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;">';
        html += '<thead><tr><th style="' + DS.th + '">Day</th><th style="' + DS.th + '">Format</th><th style="' + DS.th + '">Topic</th><th style="' + DS.th + '">Hook</th></tr></thead><tbody>';
        (w.posts || []).forEach(function(p) {
          html += '<tr><td style="' + DS.td + ' font-weight:600;">' + e(p.day) + '</td>';
          html += '<td style="' + DS.td + '"><span style="display:inline-block; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; background:rgba(124,92,252,0.1); color:#7C5CFC;">' + e(p.format) + '</span></td>';
          html += '<td style="' + DS.td + '">' + e(p.topic) + '</td>';
          html += '<td style="' + DS.td + ' font-style:italic; color:#475569;">' + e(p.hook) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  // Expose globally so Reports tab can use it
  window.renderBrandReport = renderBrandReport;

  // ── Competitor Intelligence Deep-Dive ──
  let compIntelHtml = '';
  if (competitors.length > 0) {
    const compSorted = [...competitors].sort((a, b) => (b.tiktok?.avgViews || 0) - (a.tiktok?.avgViews || 0));
    const clientTTAvgViews = (() => {
      const ttPosts = posts.tiktok || [];
      if (ttPosts.length === 0) return 0;
      return Math.round(ttPosts.reduce((s, p) => s + (p.views || 0), 0) / ttPosts.length);
    })();
    const clientTTAvgEng = (() => {
      const ttPosts = posts.tiktok || [];
      if (ttPosts.length === 0) return 0;
      return Math.round(ttPosts.reduce((s, p) => s + engScore(p), 0) / ttPosts.length);
    })();

    // Performance tier assignment
    function getTier(avgViews) {
      if (avgViews >= 50000) return { label: 'Dominant', color: '#22C55E', icon: '🟢' };
      if (avgViews >= 10000) return { label: 'Strong', color: '#3B82F6', icon: '🔵' };
      if (avgViews >= 2000) return { label: 'Average', color: '#F59E0B', icon: '🟡' };
      return { label: 'Weak', color: '#EF4444', icon: '🔴' };
    }

    // Build WHY analysis for each competitor
    function analyseWhy(comp) {
      const avgViews = comp.tiktok?.avgViews || 0;
      const avgEng = comp.tiktok?.avgEngagement || 0;
      const videos = comp.tiktok?.videos || [];
      const engRate = avgViews > 0 ? ((avgEng / avgViews) * 100).toFixed(1) : 0;

      const insights = [];

      if (videos.length > 0) {
        const avgDuration = Math.round(videos.reduce((s, v) => s + (v.duration || 0), 0) / videos.length);
        const avgShares = Math.round(videos.reduce((s, v) => s + (v.shares || 0), 0) / videos.length);
        const avgComments = Math.round(videos.reduce((s, v) => s + (v.comments || 0), 0) / videos.length);
        const shareToLike = videos.reduce((s, v) => s + (v.shares || 0), 0) / Math.max(1, videos.reduce((s, v) => s + (v.likes || 0), 0));

        if (avgDuration > 120) insights.push('Long-form content (avg ' + avgDuration + 's) — deep policy explainers that build authority');
        else if (avgDuration > 60) insights.push('Medium-length videos (avg ' + avgDuration + 's) — balances depth with retention');
        else if (avgDuration > 0) insights.push('Short punchy clips (avg ' + avgDuration + 's) — optimised for TikTok algorithm');

        if (shareToLike > 0.3) insights.push('High share-to-like ratio (' + (shareToLike * 100).toFixed(0) + '%) — content people feel compelled to share');
        if (avgComments > 30) insights.push('Strong comment engagement (avg ' + avgComments + '/post) — sparks debate and discussion');
        if (avgShares > 50) insights.push('Viral distribution (avg ' + avgShares + ' shares/post) — content escapes the follower bubble');
      }

      const captions = videos.map(v => v.caption || '').join(' ').toLowerCase();
      if (captions.includes('urgent') || captions.includes('must') || captions.includes('demand') || captions.includes('fight')) {
        insights.push('Emotionally charged language — urgency and confrontation drive engagement');
      }
      if (captions.includes('cost of living') || captions.includes('housing') || captions.includes('cpf') || captions.includes('retire')) {
        insights.push('Hits bread-and-butter issues — cost of living, housing, CPF resonate deeply');
      }
      if (captions.includes('parliament') || captions.includes('budget') || captions.includes('government')) {
        insights.push('Leverages parliamentary authority — clips from actual debates carry weight');
      }

      return insights;
    }

    // Competitor accordion cards
    const compCards = compSorted.map((comp, idx) => {
      const tier = getTier(comp.tiktok?.avgViews || 0);
      const insights = analyseWhy(comp);
      const ratio = clientTTAvgViews > 0 ? ((comp.tiktok?.avgViews || 0) / clientTTAvgViews).toFixed(1) : '—';

      const compIgUrl = comp.instagram?.url || '';
      const compTtUrl = comp.tiktok?.url || '';
      const compLiUrl = comp.linkedin?.url || '';
      const compLinks = [
        compIgUrl ? '<a href="' + compIgUrl + '" target="_blank" rel="noopener" style="color:#E4405F; font-size:11px; text-decoration:none; background:rgba(228,64,95,0.08); padding:2px 8px; border-radius:10px;">📸 Instagram ↗</a>' : '',
        compTtUrl ? '<a href="' + compTtUrl + '" target="_blank" rel="noopener" style="font-size:11px; text-decoration:none; background:rgba(0,0,0,0.05); padding:2px 8px; border-radius:10px; color:#475569;">🎵 TikTok ↗</a>' : '',
        compLiUrl ? '<a href="' + compLiUrl + '" target="_blank" rel="noopener" style="color:#0A66C2; font-size:11px; text-decoration:none; background:rgba(10,102,194,0.08); padding:2px 8px; border-radius:10px;">💼 LinkedIn ↗</a>' : '',
      ].filter(Boolean).join(' ');

      const detailId = 'comp-detail-' + idx;

      return `
        <div style="${DS.card}; margin-bottom:12px; padding:0; overflow:hidden;">
          <div onclick="var el=document.getElementById('${detailId}');el.style.display=el.style.display==='none'?'block':'none';var arr=this.querySelector('.comp-arrow');arr.textContent=el.style.display==='none'?'▸':'▾';"
               style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; cursor:pointer; transition:background 0.15s;"
               onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='#fff'">
            <div style="display:flex; align-items:center; gap:10px;">
              ${(() => { const colors = ['#7C5CFC','#E4405F','#0984E3','#00B894','#F59E0B','#EF4444','#6C5CE7','#E17055','#00CEC9','#FDCB6E','#A29BFE','#74B9FF']; const bgC = colors[idx % colors.length]; const ini = comp.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); return '<div style="width:36px;height:36px;border-radius:50%;background:' + bgC + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">' + ini + '</div>'; })()}
              <span style="font-size:18px;">${tier.icon}</span>
              <span style="font-size:14px; font-weight:600; color:#1E293B;">${comp.name}</span>
              <span style="${DS.muted}">${comp.party || comp.category || ''}</span>
              <span style="color:${tier.color}; font-size:11px; font-weight:700; background:${tier.color}11; padding:2px 10px; border-radius:12px;">${tier.label}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:13px; color:#475569; font-weight:600;">${fmt(comp.tiktok?.avgViews || 0)} avg views</span>
              <span class="comp-arrow" style="color:#94A3B8; font-size:14px;">▸</span>
            </div>
          </div>
          <div id="${detailId}" style="display:none; padding:0 20px 20px; border-top:1px solid #F1F5F9;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin:16px 0;">
              <div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;">
                <div style="${DS.label}">Avg Views</div>
                <div style="font-size:20px; font-weight:700; color:#1E293B;">${fmt(comp.tiktok?.avgViews || 0)}</div>
              </div>
              <div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;">
                <div style="${DS.label}">Avg Engagement</div>
                <div style="font-size:20px; font-weight:700; color:#1E293B;">${fmt(comp.tiktok?.avgEngagement || 0)}</div>
              </div>
              <div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;">
                <div style="${DS.label}">Videos</div>
                <div style="font-size:20px; font-weight:700; color:#1E293B;">${comp.tiktok?.totalVideos || 0}</div>
              </div>
              ${comp.instagram?.followers ? '<div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;"><div style="' + DS.label + '">IG Followers</div><div style="font-size:20px; font-weight:700; color:#1E293B;">' + fmt(comp.instagram.followers) + '</div></div>' : ''}
              ${comp.linkedin?.followers ? '<div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;"><div style="' + DS.label + '">LI Followers</div><div style="font-size:20px; font-weight:700; color:#0A66C2;">' + fmt(comp.linkedin.followers) + '</div></div>' : ''}
              <div style="background:#F8FAFC; border-radius:10px; padding:12px; text-align:center;">
                <div style="${DS.label}">vs You</div>
                <div style="font-size:20px; font-weight:700; color:${(comp.tiktok?.avgViews || 0) > clientTTAvgViews ? '#EF4444' : '#22C55E'};">${ratio}x</div>
              </div>
            </div>
            ${insights.length > 0 ? `
              <div style="margin-top:8px;">
                <div style="${DS.label}; margin-bottom:6px;">Why they perform</div>
                ${insights.map(ins => '<div style="color:#475569; font-size:12px; padding:3px 0; line-height:1.5;">• ' + ins + '</div>').join('')}
              </div>
            ` : ''}
            <div style="margin-top:12px; display:flex; gap:8px;">${compLinks}</div>
          </div>
        </div>
      `;
    }).join('');

    // LLM-powered deep analysis button + cached content
    const cachedIntel = d.competitorIntel;
    let intelContentHtml = '';
    if (cachedIntel?.structured) {
      intelContentHtml = renderMcKinseyIntel(cachedIntel.structured);
    } else if (cachedIntel?.analysis) {
      // Legacy raw-text — don't render markdown slop, prompt regeneration
      intelContentHtml = '<div style="' + DS.card + '; margin-top:12px; border-left:4px solid #F59E0B; text-align:center; padding:24px;">'
        + '<div style="font-size:24px; margin-bottom:8px;">⚠️</div>'
        + '<p style="font-size:14px; font-weight:600; color:#1E293B; margin-bottom:4px;">Legacy report detected</p>'
        + '<p style="font-size:13px; color:#475569;">This report was generated in an older format. Click <strong>Generate Brand Strategy Report</strong> above to create a new McKinsey-style report with data validation.</p>'
        + '</div>';
    }

    compIntelHtml = `
      <div style="margin-top:28px;">
        <h3 style="${DS.sectionTitle}; display:flex; align-items:center; gap:8px;">🕵️ Competitor Intelligence — Why They Win</h3>
        <p style="${DS.muted}; margin-bottom:16px;">Deep analysis of what drives competitor performance. Understanding <em>why</em> they succeed reveals what you should adopt, adapt, or avoid.</p>

        <div style="${DS.card}; margin-bottom:16px; padding:16px;">
          <div style="display:flex; gap:12px; margin-bottom:16px; align-items:center; flex-wrap:wrap;">
            <span style="font-size:14px; font-weight:600; color:#1E293B;">Your position:</span>
            <span style="font-size:13px; color:#475569;">🎵 ${fmt(clientTTAvgViews)} avg views</span>
            <span style="${DS.muted}">${fmt(clientTTAvgEng)} avg eng</span>
            <span style="${DS.muted}">|</span>
            <span style="${DS.muted}">Rank: ${compSorted.filter(c => (c.tiktok?.avgViews || 0) > clientTTAvgViews).length + 1} of ${compSorted.length + 1} tracked accounts</span>
          </div>
          ${compCards}
        </div>

        ${cachedIntel?.structured ? renderMcKinseyIntel(cachedIntel.structured) : ''}
      </div>
    `;
  }

  // Competitor benchmarking table
  let benchmarkHtml = '';
  if (competitors.length > 0) {
    const clientTTAvgViews = (() => {
      const ttPosts = posts.tiktok || [];
      if (ttPosts.length === 0) return 0;
      return Math.round(ttPosts.reduce((s, p) => s + (p.views || 0), 0) / ttPosts.length);
    })();
    const clientTTAvgEng = (() => {
      const ttPosts = posts.tiktok || [];
      if (ttPosts.length === 0) return 0;
      return Math.round(ttPosts.reduce((s, p) => s + engScore(p), 0) / ttPosts.length);
    })();
    const clientIGFollowers = platforms.instagram?.followers || 0;

    // Compute category averages
    const catAvgViews = competitors.reduce((s, c) => s + (c.tiktok?.avgViews || 0), 0) / competitors.length;
    const catAvgEng = competitors.reduce((s, c) => s + (c.tiktok?.avgEngagement || 0), 0) / competitors.length;
    const catAvgIG = competitors.reduce((s, c) => s + (c.instagram?.followers || 0), 0) / competitors.length;

    function trafficLight(clientVal, catAvg) {
      if (clientVal >= catAvg) return '🟢';
      if (clientVal >= catAvg * 0.9) return '🟡';
      return '🔴';
    }

    const rows = competitors.map((c, i) => {
      const ttViews = c.tiktok?.avgViews || 0;
      const ttEng = c.tiktok?.avgEngagement || 0;
      const igFollowers = c.instagram?.followers || 0;

      const viewsStatus = clientTTAvgViews > ttViews ? '🟢' : clientTTAvgViews > ttViews * 0.7 ? '🟡' : '🔴';
      const engStatus = clientTTAvgEng > ttEng ? '🟢' : clientTTAvgEng > ttEng * 0.7 ? '🟡' : '🔴';
      const igStatus = clientIGFollowers > igFollowers ? '🟢' : clientIGFollowers > igFollowers * 0.5 ? '🟡' : '🔴';

      const cIgUrl = c.instagram?.url || '';
      const cTtUrl = c.tiktok?.url || '';
      const cLinks = [
        cIgUrl ? '<a href="' + cIgUrl + '" target="_blank" rel="noopener" style="color:#E4405F; text-decoration:none; font-size:11px;" title="View Instagram">📸</a>' : '',
        cTtUrl ? '<a href="' + cTtUrl + '" target="_blank" rel="noopener" style="color:#475569; text-decoration:none; font-size:11px;" title="View TikTok">🎵</a>' : '',
      ].filter(Boolean).join(' ');

      const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

      return '<tr style="background:' + rowBg + ';">'
        + '<td style="' + DS.td + ' font-weight:500; color:#1E293B;">' + c.name + ' ' + cLinks + '</td>'
        + '<td style="' + DS.td + '">' + (c.party || c.category || '—') + '</td>'
        + '<td style="' + DS.td + '">' + viewsStatus + ' ' + fmt(ttViews) + '</td>'
        + '<td style="' + DS.td + '">' + engStatus + ' ' + fmt(ttEng) + '</td>'
        + '<td style="' + DS.td + '">' + igStatus + ' ' + fmt(igFollowers) + '</td>'
        + '</tr>';
    }).join('');

    // Client row (highlighted)
    const clientRow = '<tr style="background:#F0EDFF;">'
      + '<td style="' + DS.td + ' font-weight:700; color:' + DS.brand + ';">You (Client)</td>'
      + '<td style="' + DS.td + '">—</td>'
      + '<td style="' + DS.td + ' font-weight:600;">' + trafficLight(clientTTAvgViews, catAvgViews) + ' ' + fmt(clientTTAvgViews) + '</td>'
      + '<td style="' + DS.td + ' font-weight:600;">' + trafficLight(clientTTAvgEng, catAvgEng) + ' ' + fmt(clientTTAvgEng) + '</td>'
      + '<td style="' + DS.td + ' font-weight:600;">' + trafficLight(clientIGFollowers, catAvgIG) + ' ' + fmt(clientIGFollowers) + '</td>'
      + '</tr>';

    benchmarkHtml = `
      <div style="margin-top:24px;">
        <h3 style="${DS.sectionTitle}">🏆 Competitor Benchmarking</h3>
        <div style="${DS.card}; padding:16px; margin-bottom:12px;">
          <div style="display:flex; gap:16px; margin-bottom:12px; font-size:12px; color:#94A3B8; flex-wrap:wrap;">
            <span>🟢 Above average</span> <span>🟡 Within 10%</span> <span>🔴 Below average</span>
            <span style="margin-left:auto; color:#475569;">Your TT avg: ${fmt(clientTTAvgViews)} views, ${fmt(clientTTAvgEng)} eng | IG: ${fmt(clientIGFollowers)} followers</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead><tr>
                <th style="${DS.th}">Competitor</th>
                <th style="${DS.th}">Category</th>
                <th style="${DS.th}">TT Avg Views</th>
                <th style="${DS.th}">TT Avg Eng</th>
                <th style="${DS.th}">IG Followers</th>
              </tr></thead>
              <tbody>
                ${clientRow}
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // Performance indicators
  const igFollowers = platforms.instagram?.followers || 0;
  const ttFollowers = platforms.tiktok?.followers || 0;
  const igEngRate = allPosts.filter(p => p.platform === 'instagram').length > 0 && igFollowers > 0
    ? (allPosts.filter(p => p.platform === 'instagram').reduce((s, p) => s + p.engagement, 0) / allPosts.filter(p => p.platform === 'instagram').length / igFollowers * 100).toFixed(2)
    : null;

  const indicators = [];
  if (igEngRate) indicators.push({ label: 'IG Engagement Rate', value: igEngRate + '%', target: '1-3%', status: parseFloat(igEngRate) >= 1 ? '🟢' : '🔴' });
  if (ttFollowers > 0) {
    const ttTotalLikes = platforms.tiktok?.likes || 0;
    indicators.push({ label: 'TT Likes/Follower Ratio', value: (ttTotalLikes / ttFollowers).toFixed(1) + 'x', target: '>3x', status: ttTotalLikes / ttFollowers >= 3 ? '🟢' : '🟡' });
  }
  if (allPosts.length > 0) {
    const commentRatio = allPosts.reduce((s, p) => s + (p.comments || 0), 0) / Math.max(allPosts.reduce((s, p) => s + (p.likes || 0), 0), 1) * 100;
    indicators.push({ label: 'Comment-to-Like Ratio', value: commentRatio.toFixed(1) + '%', target: '>3%', status: commentRatio >= 3 ? '🟢' : commentRatio >= 1 ? '🟡' : '🔴' });
    const avgShares = allPosts.reduce((s, p) => s + (p.shares || 0), 0) / allPosts.length;
    indicators.push({ label: 'Avg Shares/Post', value: avgShares.toFixed(1), target: '>10', status: avgShares >= 10 ? '🟢' : avgShares >= 5 ? '🟡' : '🔴' });
  }

  const indicatorsHtml = indicators.map(ind => `
    <div style="${DS.card}; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:14px; font-weight:600; color:#1E293B;">${ind.label}</div>
        <div style="${DS.muted}">Target: ${ind.target}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:22px; font-weight:700; color:#1E293B;">${ind.value}</div>
        <div style="font-size:16px;">${ind.status}</div>
      </div>
    </div>
  `).join('');

  return `
    <div style="padding:4px 0;">
      <h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:20px;">🏅 Scorecard</h2>

      ${rankingBarHtml}

      <h3 style="${DS.sectionTitle}; color:#22C55E;">🔥 Top Performers</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; margin-bottom:24px;">
        ${top3.map((p, i) => postCard(p, '#' + (i + 1) + ' TOP', '#22C55E')).join('')}
      </div>

      <h3 style="${DS.sectionTitle}; color:#EF4444;">📉 Underperformers</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:12px; margin-bottom:24px;">
        ${flops.map((p, i) => postCard(p, 'FLOP', '#EF4444')).join('')}
      </div>

      <h3 style="${DS.sectionTitle}">📏 Key Performance Indicators</h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-bottom:24px;">
        ${indicatorsHtml}
      </div>

      ${benchmarkHtml}
      ${compIntelHtml}

      ${(() => {
        // ── Competitor Posts Section ──
        const compPostsList = [];
        for (const c of competitors) {
          for (const v of (c.tiktok?.videos || [])) {
            compPostsList.push({ ...v, platform: 'tiktok', sourceName: c.name });
          }
          for (const p of (c.instagram?.posts || [])) {
            compPostsList.push({ ...p, platform: 'instagram', sourceName: c.name });
          }
        }

        if (compPostsList.length === 0) return '';

        // Sort by views desc, take top 20
        compPostsList.sort((a, b) => (b.views || 0) - (a.views || 0));
        const topCompPosts = compPostsList.slice(0, 20);

        const compPostCards = topCompPosts.map(p => {
          const pIcon = platformIcons[p.platform] || '📊';
          const pColor = platformColors[p.platform] || '#94A3B8';
          const caption = (p.caption || '').slice(0, 80);
          const thumbUrl = p.thumbnail || '';
          const thumbHtml = thumbUrl
            ? '<div style="border-radius:10px; height:120px; overflow:hidden; margin-bottom:8px; background:#F1F5F9;"><img src="' + thumbUrl + '" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML=\'<div style=\\\'display:flex;align-items:center;justify-content:center;height:100%;font-size:28px\\\'>' + pIcon + '</div>\'" /></div>'
            : '<div style="background:linear-gradient(135deg, ' + pColor + '15, ' + pColor + '08); border-radius:10px; height:60px; display:flex; align-items:center; justify-content:center; margin-bottom:8px;"><span style="font-size:24px;">' + pIcon + '</span></div>';

          return '<div style="' + DS.card + ' scroll-snap-align:start; flex-shrink:0; width:240px;">'
            + thumbHtml
            + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">'
            + '<span style="font-size:11px; font-weight:600; color:#1E293B;">' + (p.sourceName || '') + '</span>'
            + '<span style="background:' + pColor + '; color:#fff; padding:1px 6px; border-radius:6px; font-size:9px; font-weight:600;">' + p.platform + '</span>'
            + '</div>'
            + '<div style="color:#475569; font-size:11px; line-height:1.3; margin-bottom:6px; height:28px; overflow:hidden;">' + (caption || 'Untitled') + (caption.length >= 80 ? '...' : '') + '</div>'
            + '<div style="display:flex; gap:6px; font-size:10px; color:#94A3B8; flex-wrap:wrap;">'
            + '<span>👁 ' + fmt(p.views || 0) + '</span>'
            + '<span>❤️ ' + fmt(p.likes || 0) + '</span>'
            + '<span>💬 ' + (p.comments || 0) + '</span>'
            + (p.shares ? '<span>🔄 ' + p.shares + '</span>' : '')
            + '</div>'
            + (p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener" style="display:block; margin-top:6px; color:' + DS.brand + '; text-decoration:none; font-size:11px; font-weight:600;">View post ↗</a>' : '')
            + '</div>';
        }).join('');

        return '<div style="margin-top:32px;">'
          + '<h3 style="' + DS.sectionTitle + '">🔥 Competitor Posts — Top by Views</h3>'
          + '<p style="' + DS.muted + '; margin-bottom:12px;">' + compPostsList.length + ' competitor posts tracked. Scroll horizontally to browse the top 20.</p>'
          + '<div style="display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; padding:8px 0 16px;">'
          + compPostCards
          + '</div>'
          + '</div>';
      })()}
    </div>
  `;
};

// ═══════════════════════════════════════════════════
// Topic Research Results Renderer
// ═══════════════════════════════════════════════════
function renderTopicResearchResults(data) {
  if (!data) return '';

  // Handle raw/unparsed response
  if (data.raw || data.isRaw) {
    return '<div style="' + DS.card + '">'
      + '<p style="color:#F59E0B; font-size:13px; margin-bottom:8px;">⚠️ The AI returned unstructured text. Displaying raw response:</p>'
      + '<pre style="color:#475569; white-space:pre-wrap; font-size:13px; line-height:1.6;">' + (data.analysis || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'
      + '</div>';
  }

  let html = '';

  // ── Topic Scorecard ──
  if (data.topicAnalysis?.length > 0) {
    html += '<div style="margin-bottom:20px;">'
      + '<h4 style="' + DS.sectionTitle + '">📊 Topic Scorecard</h4>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">';
    for (const t of data.topicAnalysis) {
      const scores = [
        { label: 'Trend', value: t.trendScore, colour: DS.brand },
        { label: 'Relevance', value: t.audienceRelevance, colour: '#22C55E' },
        { label: 'Competition', value: t.competition, colour: '#EF4444' },
        { label: 'Viral', value: t.viralPotential, colour: '#F59E0B' },
      ];
      const scoreBars = scores.map(s =>
        '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">'
        + '<span style="' + DS.muted + '; width:75px;">' + s.label + '</span>'
        + '<div style="flex:1; height:8px; background:#F1F5F9; border-radius:4px; overflow:hidden;">'
        + '<div style="height:100%; width:' + ((s.value || 0) * 10) + '%; background:' + s.colour + '; border-radius:4px; transition:width 0.3s;"></div>'
        + '</div>'
        + '<span style="color:' + s.colour + '; font-size:12px; font-weight:600; width:20px; text-align:right;">' + (s.value || 0) + '</span>'
        + '</div>'
      ).join('');
      html += '<div style="' + DS.card + '">'
        + '<div style="font-size:14px; font-weight:600; color:#1E293B; margin-bottom:10px;">' + (t.topic || '').replace(/</g, '&lt;') + '</div>'
        + scoreBars
        + '<div style="margin-top:10px; padding-top:10px; border-top:1px solid #F1F5F9;">'
        + '<div style="color:' + DS.brand + '; font-size:12px; font-weight:600; margin-bottom:4px;">💡 Recommended Angle</div>'
        + '<div style="color:#475569; font-size:12px; line-height:1.5;">' + (t.recommendedAngle || '').replace(/</g, '&lt;') + '</div>'
        + '</div>'
        + (t.reasoning ? '<div style="margin-top:6px; ' + DS.muted + '; line-height:1.4;">' + t.reasoning.replace(/</g, '&lt;') + '</div>' : '')
        + '</div>';
    }
    html += '</div></div>';
  }

  // ── Priority Ranking ──
  if (data.priorityRanking?.length > 0) {
    html += '<div style="margin-bottom:20px;">'
      + '<h4 style="' + DS.sectionTitle + '">🏆 Priority Ranking</h4>'
      + '<div style="' + DS.card + '">';
    for (const p of data.priorityRanking) {
      const rankColour = p.rank === 1 ? '#F59E0B' : p.rank === 2 ? '#94A3B8' : p.rank === 3 ? '#CD7F32' : '#94A3B8';
      html += '<div style="display:flex; align-items:flex-start; gap:12px; padding:10px 0; ' + (p.rank > 1 ? 'border-top:1px solid #F1F5F9;' : '') + '">'
        + '<div style="min-width:32px; height:32px; border-radius:50%; background:' + rankColour + '18; color:' + rankColour + '; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; border:2px solid ' + rankColour + ';">' + p.rank + '</div>'
        + '<div>'
        + '<div style="font-size:14px; font-weight:600; color:#1E293B;">' + (p.topic || '').replace(/</g, '&lt;') + '</div>'
        + '<div style="' + DS.muted + '; margin-top:4px; line-height:1.4;">' + (p.reasoning || '').replace(/</g, '&lt;') + '</div>'
        + '</div></div>';
    }
    html += '</div></div>';
  }

  // ── Filming List (Production Board) ──
  if (data.filmingList?.length > 0) {
    html += '<div style="margin-bottom:20px;">'
      + '<h4 style="' + DS.sectionTitle + '">🎬 Filming List — Production Board</h4>'
      + '<div style="overflow-x:auto;">'
      + '<table style="width:100%; border-collapse:collapse; background:#FFFFFF; border-radius:16px; overflow:hidden; border:1px solid #F1F5F9;">'
      + '<thead><tr>'
      + '<th style="' + DS.th + '">Priority</th>'
      + '<th style="' + DS.th + '">Topic</th>'
      + '<th style="' + DS.th + '">Format</th>'
      + '<th style="' + DS.th + '">Hook (first 3s)</th>'
      + '<th style="' + DS.th + '">Talking Points</th>'
      + '<th style="' + DS.th + '">CTA</th>'
      + '<th style="' + DS.th + '">Time</th>'
      + '</tr></thead><tbody>';
    for (const f of data.filmingList) {
      const priBadge = f.priority === 'high'
        ? '<span style="' + DS.redDelta + '">🔴 High</span>'
        : f.priority === 'medium'
        ? '<span style="color:#F59E0B; background:rgba(245,158,11,0.1); padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; display:inline-block;">🟡 Medium</span>'
        : '<span style="' + DS.greenDelta + '">🟢 Low</span>';
      const talkingPts = (f.talkingPoints || []).map(tp => '<li style="margin-bottom:2px;">' + tp.replace(/</g, '&lt;') + '</li>').join('');
      html += '<tr style="border-bottom:1px solid #F1F5F9;">'
        + '<td style="' + DS.td + ' vertical-align:top;">' + priBadge + '</td>'
        + '<td style="' + DS.td + ' font-weight:600; color:#1E293B; vertical-align:top;">' + (f.topic || '').replace(/</g, '&lt;') + '</td>'
        + '<td style="' + DS.td + ' vertical-align:top;"><span style="background:rgba(124,92,252,0.08); color:' + DS.brand + '; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:500;">' + (f.format || '').replace(/</g, '&lt;') + '</span></td>'
        + '<td style="' + DS.td + ' color:#F59E0B; font-size:12px; font-style:italic; vertical-align:top; max-width:200px;">"' + (f.hook || '').replace(/</g, '&lt;') + '"</td>'
        + '<td style="' + DS.td + ' vertical-align:top;"><ul style="margin:0; padding-left:16px; color:#475569; font-size:12px; line-height:1.5;">' + talkingPts + '</ul></td>'
        + '<td style="' + DS.td + ' color:#22C55E; font-size:12px; vertical-align:top;">' + (f.cta || '').replace(/</g, '&lt;') + '</td>'
        + '<td style="' + DS.td + ' color:#94A3B8; font-size:12px; white-space:nowrap; vertical-align:top;">' + (f.estimatedTime || '').replace(/</g, '&lt;') + '</td>'
        + '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // ── Content Gaps ──
  if (data.contentGaps?.length > 0) {
    html += '<div style="margin-bottom:20px;">'
      + '<h4 style="' + DS.sectionTitle + '">🕳️ Content Gaps</h4>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:10px;">';
    for (const gap of data.contentGaps) {
      html += '<div style="background:rgba(239,68,68,0.04); border:1px solid rgba(239,68,68,0.12); border-radius:12px; padding:12px; color:#EF4444; font-size:13px; line-height:1.5;">'
        + '<span style="margin-right:6px;">⚠️</span>' + (typeof gap === 'string' ? gap : JSON.stringify(gap)).replace(/</g, '&lt;')
        + '</div>';
    }
    html += '</div></div>';
  }

  // ── Quick Wins ──
  if (data.quickWins?.length > 0) {
    html += '<div style="margin-bottom:20px;">'
      + '<h4 style="' + DS.sectionTitle + '">⚡ Quick Wins</h4>'
      + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">';
    for (const qw of data.quickWins) {
      html += '<div style="background:rgba(34,197,94,0.04); border:1px solid rgba(34,197,94,0.12); border-radius:12px; padding:14px;">'
        + '<div style="color:#22C55E; font-weight:600; font-size:14px; margin-bottom:6px;">✅ ' + (qw.topic || '').replace(/</g, '&lt;') + '</div>'
        + '<div style="color:#475569; font-size:12px; line-height:1.5; margin-bottom:6px;">' + (qw.why || '').replace(/</g, '&lt;') + '</div>'
        + '<span style="' + DS.greenDelta + '">Effort: ' + (qw.effort || 'low').replace(/</g, '&lt;') + '</span>'
        + '</div>';
    }
    html += '</div></div>';
  }

  // Generated at timestamp
  if (data.generatedAt) {
    html += '<div style="' + DS.muted + '; text-align:right; margin-top:8px;">Generated: ' + new Date(data.generatedAt).toLocaleString() + '</div>';
  }

  return html;
}

// ═══════════════════════════════════════════════════
// TAB: Strategy & Tasks — Gamified with XP, streaks, FOMO
// ═══════════════════════════════════════════════════
window.renderStrategyTasks = function(d, selectedId) {
  const API = window.location.origin + '/api';

  // Load legacy tasks from localStorage (for XP system)
  const storageKey = 'social-intel-tasks-' + selectedId;
  const tasks = JSON.parse(localStorage.getItem(storageKey) || '[]');

  // Load structured tasks from server
  const structuredTasks = d.tasks || { goals: [], strategy: [], filmingStyle: [], documents: [], actionables: [] };

  // ── XP & Level System ──
  const completedTasks = tasks.filter(t => t.done).length;
  const totalTasks = tasks.length;
  const xpPerTask = 25;
  const xpFromTasks = completedTasks * xpPerTask;

  const totalContent = Object.values(d.posts?.platforms || {}).reduce((s, p) => s + p.length, 0);
  const xpFromContent = totalContent * 10;

  const history = d.history?.scrapeHistory || d.history?.snapshots || [];
  let followerGrowth = 0;
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    followerGrowth = ((last.instagram?.followers || 0) - (first.instagram?.followers || 0))
      + ((last.tiktok?.followers || 0) - (first.tiktok?.followers || 0))
      + ((last.facebook?.pageLikes || last.facebook?.followers || 0) - (first.facebook?.pageLikes || first.facebook?.followers || 0));
  }
  const xpFromGrowth = Math.max(0, followerGrowth);

  const totalXP = xpFromTasks + xpFromContent + xpFromGrowth;

  const levels = [
    { name: 'Rookie', min: 0, icon: '🌱' },
    { name: 'Creator', min: 100, icon: '📱' },
    { name: 'Strategist', min: 300, icon: '🎯' },
    { name: 'Influencer', min: 600, icon: '⚡' },
    { name: 'Authority', min: 1000, icon: '👑' },
    { name: 'Legend', min: 2000, icon: '🏆' },
  ];
  const currentLevel = [...levels].reverse().find(l => totalXP >= l.min) || levels[0];
  const nextLevel = levels.find(l => l.min > totalXP) || levels[levels.length - 1];
  const xpToNext = nextLevel.min - totalXP;
  const levelProgress = nextLevel.min > currentLevel.min
    ? ((totalXP - currentLevel.min) / (nextLevel.min - currentLevel.min) * 100).toFixed(0)
    : 100;

  // ── Streak Tracking ──
  const streakKey = 'social-intel-streak-' + selectedId;
  const streakData = JSON.parse(localStorage.getItem(streakKey) || '{"current":0,"best":0,"lastDate":null}');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayTasks = tasks.filter(t => t.done && t.completedAt?.slice(0, 10) === today);
  if (todayTasks.length > 0 && streakData.lastDate !== today) {
    if (streakData.lastDate === yesterday || streakData.lastDate === today) {
      streakData.current += 1;
    } else {
      streakData.current = 1;
    }
    streakData.lastDate = today;
    if (streakData.current > streakData.best) streakData.best = streakData.current;
    localStorage.setItem(streakKey, JSON.stringify(streakData));
  }

  // ── Competitor FOMO Section (horizontal carousel) ──
  const competitors = d.competitors?.competitors || [];
  let fomoHtml = '';
  if (competitors.length > 0) {
    const clientAvgViews = (() => {
      const allClientPosts = Object.values(d.posts?.platforms || {}).flat();
      if (allClientPosts.length === 0) return 0;
      return Math.round(allClientPosts.reduce((s, p) => s + (p.views || 0), 0) / allClientPosts.length);
    })();

    function extractTopic(caption) {
      if (!caption) return null;
      const c = caption.toLowerCase();
      if (c.includes('housing') || c.includes('hdb') || c.includes('flat')) return 'housing';
      if (c.includes('cpf') || c.includes('retire') || c.includes('pension')) return 'CPF & retirement';
      if (c.includes('cost of living') || c.includes('gst') || c.includes('inflation') || c.includes('price')) return 'cost of living';
      if (c.match(/\bai\b/) || c.includes('artificial intelligence') || c.includes('technology')) return 'AI & technology';
      if (c.includes('education') || c.includes('school') || c.includes('class size') || c.includes('student')) return 'education';
      if (c.includes('foreign') || c.includes('immigration') || c.includes('worker')) return 'immigration & foreign workers';
      if (c.includes('parliament') || c.includes('budget') || c.includes('debate')) return 'parliamentary debate';
      if (c.includes('health') || c.includes('hospital') || c.includes('medic')) return 'healthcare';
      if (c.includes('job') || c.includes('employ') || c.includes('wage') || c.includes('work')) return 'jobs & wages';
      if (c.includes('transport') || c.includes('mrt') || c.includes('bus') || c.includes('fuel') || c.includes('electric')) return 'transport & energy';
      if (c.includes('consumer') || c.includes('scam') || c.includes('predatory') || c.includes('sales')) return 'consumer protection';
      if (c.includes('military') || c.includes('defence') || c.includes('idf') || c.includes('conflict')) return 'defence & foreign affairs';
      if (c.includes('sport') || c.includes('athlete')) return 'sports';
      if (c.includes('ramadan') || c.includes('lunar') || c.includes('festival') || c.includes('community')) return 'community & culture';
      return null;
    }

    const recentFeed = [];
    for (const c of competitors) {
      for (const v of (c.tiktok?.videos || [])) {
        if (!v.date) continue;
        const daysAgo = Math.round((Date.now() - new Date(v.date).getTime()) / 86400000);
        if (daysAgo <= 30) {
          recentFeed.push({
            name: c.name, party: c.party, platform: 'tiktok',
            thumbnail: v.thumbnail || '',
            views: v.views || 0, likes: v.likes || 0, comments: v.comments || 0,
            shares: v.shares || 0, saves: v.saves || 0,
            engagement: (v.likes || 0) + (v.comments || 0) + (v.shares || 0) + (v.saves || 0),
            caption: v.caption || '', topic: extractTopic(v.caption),
            date: v.date, daysAgo, url: v.url, duration: v.duration || 0,
          });
        }
      }
      for (const p of (c.instagram?.posts || [])) {
        if (!p.date) continue;
        const daysAgo = Math.round((Date.now() - new Date(p.date).getTime()) / 86400000);
        if (daysAgo <= 30) {
          recentFeed.push({
            name: c.name, party: c.party, platform: 'instagram',
            thumbnail: p.thumbnail || '',
            views: p.views || 0, likes: p.likes || 0, comments: p.comments || 0,
            shares: p.shares || 0, saves: p.saves || 0,
            engagement: (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0),
            caption: p.caption || '', topic: extractTopic(p.caption),
            date: p.date, daysAgo, url: p.url, duration: 0,
          });
        }
      }
      for (const p of (c.linkedin?.posts || [])) {
        recentFeed.push({
          name: c.name, party: c.party, platform: 'linkedin',
          thumbnail: '',
          views: 0, likes: p.likes || 0, comments: p.comments || 0,
          shares: 0, saves: 0,
          engagement: (p.likes || 0) + (p.comments || 0),
          caption: p.text || '', topic: extractTopic(p.text),
          date: null, daysAgo: 0, url: p.url || '', duration: 0,
        });
      }
    }

    window._fomoFeed = recentFeed;
    window._fomoClientAvg = clientAvgViews;

    // Carousel card renderer
    window._renderFomoFeed = function(sortBy, filterPlatform, filterCompetitor) {
      let feed = [...window._fomoFeed];
      if (filterPlatform && filterPlatform !== 'all') {
        feed = feed.filter(p => p.platform === filterPlatform);
      }
      if (filterCompetitor && filterCompetitor !== 'all') {
        feed = feed.filter(p => p.name === filterCompetitor);
      }
      const sortMap = {
        views: (a, b) => b.views - a.views,
        engagement: (a, b) => b.engagement - a.engagement,
        likes: (a, b) => b.likes - a.likes,
        comments: (a, b) => b.comments - a.comments,
        shares: (a, b) => b.shares - a.shares,
        newest: (a, b) => a.daysAgo - b.daysAgo,
        oldest: (a, b) => b.daysAgo - a.daysAgo,
      };
      feed.sort(sortMap[sortBy] || sortMap.views);

      const avgViews = window._fomoClientAvg;
      const top = feed.slice(0, 15);

      if (top.length === 0) return '<p style="' + DS.muted + '; padding:8px 0;">No posts match your filters.</p>';

      // Render as horizontal carousel cards
      return '<div style="display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; padding:8px 0 16px;">'
        + top.map(p => {
          const timeLabel = p.daysAgo === 0 ? 'today' : p.daysAgo === 1 ? 'yesterday' : p.daysAgo + 'd ago';
          const snippet = p.caption ? p.caption.slice(0, 80).replace(/\n/g, ' ') : 'Untitled post';
          const viewsRatio = avgViews > 0 ? (p.views / avgViews).toFixed(1) : '?';
          const isViral = p.views > avgViews * 3;
          const borderColor = isViral ? '#EF4444' : p.views > avgViews ? '#F59E0B' : '#F1F5F9';
          const pIcon = platformIcons[p.platform] || '📊';

          const fomoThumb = p.thumbnail || p.thumbnailUrl || '';
          const fomoThumbHtml = fomoThumb
            ? '<div style="border-radius:10px; height:120px; overflow:hidden; margin-bottom:8px; background:#F1F5F9;"><img src="' + fomoThumb + '" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.style.display=\'none\'" /></div>'
            : '';

          return '<div style="' + DS.card + ' scroll-snap-align:start; flex-shrink:0; width:220px; border-top:3px solid ' + borderColor + ';">'
            + fomoThumbHtml
            + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">'
            + '<div style="display:flex; align-items:center; gap:4px;">'
            + (isViral ? '<span style="font-size:12px;">🚨</span>' : '<span style="font-size:12px;">' + pIcon + '</span>')
            + '<span style="font-size:12px; font-weight:600; color:#1E293B;">' + p.name + '</span>'
            + '</div>'
            + '<span style="' + DS.muted + '; font-size:10px;">' + timeLabel + '</span>'
            + '</div>'
            + (isViral ? '<span style="' + DS.redDelta + '; font-size:10px; margin-bottom:4px;">VIRAL</span> ' : '')
            + '<div style="font-size:18px; font-weight:700; color:#1E293B; margin-bottom:4px;">' + fmt(p.views) + ' <span style="font-size:11px; color:#94A3B8; font-weight:400;">views</span></div>'
            + '<div style="color:#475569; font-size:11px; line-height:1.4; margin-bottom:8px; height:44px; overflow:hidden;">"' + snippet + (p.caption.length > 80 ? '...' : '') + '"</div>'
            + '<div style="display:flex; gap:6px; font-size:10px; color:#94A3B8; flex-wrap:wrap;">'
            + '<span>❤️ ' + fmt(p.likes) + '</span>'
            + '<span>💬 ' + p.comments + '</span>'
            + '<span>🔄 ' + p.shares + '</span>'
            + '</div>'
            + (p.topic ? '<div style="margin-top:6px;"><span style="color:' + DS.brand + '; background:rgba(124,92,252,0.06); padding:2px 6px; border-radius:4px; font-size:10px;">' + p.topic + '</span></div>' : '')
            + (parseFloat(viewsRatio) > 1 ? '<div style="margin-top:4px; font-size:10px; font-weight:600; color:#EF4444;">' + viewsRatio + 'x your avg</div>' : '')
            + (p.url ? '<a href="' + p.url + '" target="_blank" rel="noopener" style="display:block; margin-top:6px; color:' + DS.brand + '; text-decoration:none; font-size:11px; font-weight:600;">View post ↗</a>' : '')
            + '</div>';
        }).join('')
        + '</div>';
    };

    recentFeed.sort((a, b) => b.views - a.views);

    const feedPlatforms = [...new Set(recentFeed.map(p => p.platform))];
    const feedCompetitors = [...new Set(recentFeed.map(p => p.name))];

    // Trending topics
    const topicCounts = {};
    for (const p of recentFeed) {
      if (p.topic) {
        if (!topicCounts[p.topic]) topicCounts[p.topic] = { count: 0, totalViews: 0 };
        topicCounts[p.topic].count++;
        topicCounts[p.topic].totalViews += p.views;
      }
    }
    const trendingTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1].totalViews - a[1].totalViews)
      .slice(0, 6);

    const trendingHtml = trendingTopics.length > 0 ? `
      <div style="margin-top:12px;">
        <div style="${DS.label}; margin-bottom:6px;">🔥 Trending topics competitors are posting about</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${trendingTopics.map(([topic, data]) =>
            '<span style="color:#F59E0B; font-size:12px; background:rgba(245,158,11,0.06); padding:4px 10px; border-radius:8px; border:1px solid rgba(245,158,11,0.12);">'
            + topic + ' <span style="' + DS.muted + '">(' + data.count + ' post' + (data.count > 1 ? 's' : '') + ', ' + fmt(data.totalViews) + ' views)</span>'
            + '</span>'
          ).join('')}
        </div>
      </div>
    ` : '';

    // Competitors posting more frequently
    const compFrequency = competitors.map(c => {
      const recentTT = (c.tiktok?.videos || []).filter(v => v.date && new Date(v.date) > new Date(Date.now() - 14 * 86400000)).length;
      const recentIG = (c.instagram?.posts || []).filter(p => p.date && new Date(p.date) > new Date(Date.now() - 14 * 86400000)).length;
      return { name: c.name, count: recentTT + recentIG };
    }).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

    const clientRecentCount = Object.values(d.posts?.platforms || {}).reduce((s, pPosts) => {
      return s + pPosts.filter(p => p.date && new Date(p.date) > new Date(Date.now() - 14 * 86400000)).length;
    }, 0);

    const frequencyAlert = compFrequency.length > 0 ? `
      <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <span style="${DS.label}">Posting pace (14 days):</span>
        <span style="color:${clientRecentCount < (compFrequency[0]?.count || 0) ? '#EF4444' : '#22C55E'}; font-size:12px; font-weight:600; background:#F8FAFC; padding:3px 8px; border-radius:8px; border:1px solid #F1F5F9;">You: ${clientRecentCount} posts</span>
        ${compFrequency.slice(0, 4).map(c =>
          '<span style="' + DS.muted + '; background:#F8FAFC; padding:3px 8px; border-radius:8px; border:1px solid #F1F5F9;">' + c.name + ': ' + c.count + '</span>'
        ).join('')}
      </div>
    ` : '';

    const initialFeedHtml = window._renderFomoFeed('views', 'all', 'all');

    if (recentFeed.length > 0) {
      fomoHtml = `
        <div style="${DS.card}; margin-bottom:20px; border-top:3px solid #EF4444;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <h4 style="${DS.sectionTitle}; margin-bottom:0; color:#EF4444;">🔥 Competitor Viral Posts</h4>
            <span style="${DS.muted}">Last 30 days &mdash; Updated ${fmtDate(d.competitors?.scrapedAt)}</span>
          </div>
          <p style="${DS.muted}; margin-bottom:12px;">Top-performing competitor content. Scroll horizontally to browse.</p>

          <!-- Sort & Filter Controls -->
          <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
            <label style="${DS.muted}">Sort by:</label>
            <select id="fomo-sort" style="${DS.select}" onchange="document.getElementById('fomo-feed-list').innerHTML=window._renderFomoFeed(this.value,document.getElementById('fomo-platform').value,document.getElementById('fomo-competitor').value)">
              <option value="views">Views (highest)</option>
              <option value="engagement">Engagement (highest)</option>
              <option value="likes">Likes (highest)</option>
              <option value="comments">Comments (highest)</option>
              <option value="shares">Shares (highest)</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <label style="${DS.muted}; margin-left:8px;">Platform:</label>
            <select id="fomo-platform" style="${DS.select}" onchange="document.getElementById('fomo-feed-list').innerHTML=window._renderFomoFeed(document.getElementById('fomo-sort').value,this.value,document.getElementById('fomo-competitor').value)">
              <option value="all">All platforms</option>
              ${feedPlatforms.map(p => '<option value="' + p + '">' + (platformIcons[p] || '') + ' ' + p + '</option>').join('')}
            </select>
            <label style="${DS.muted}; margin-left:8px;">Competitor:</label>
            <select id="fomo-competitor" style="${DS.select}" onchange="document.getElementById('fomo-feed-list').innerHTML=window._renderFomoFeed(document.getElementById('fomo-sort').value,document.getElementById('fomo-platform').value,this.value)">
              <option value="all">All competitors</option>
              ${feedCompetitors.map(c => '<option value="' + c + '">' + c + '</option>').join('')}
            </select>
            <span style="${DS.muted}; margin-left:auto;">${recentFeed.length} posts found</span>
          </div>

          <div id="fomo-feed-list">
            ${initialFeedHtml}
          </div>
          ${trendingHtml}
          ${frequencyAlert}
          <div style="margin-top:12px; background:#FFF7ED; border-radius:12px; padding:14px; border-left:3px solid #F59E0B;">
            <div style="color:#F59E0B; font-weight:700; font-size:13px;">💡 Action Required</div>
            <div style="color:#475569; font-size:12px; margin-top:4px;">
              ${trendingTopics.length > 0 ? 'Competitors are winning on <strong>' + trendingTopics.slice(0, 3).map(t => t[0]).join(', ') + '</strong>. Are you covering these topics?' : ''}
              ${clientRecentCount < 5 ? ' You\'ve only posted ' + clientRecentCount + ' times in 14 days — competitors are outpacing you.' : ''}
              ${recentFeed[0]?.views > clientAvgViews * 5 ? ' ' + recentFeed[0].name + '\'s latest hit ' + fmt(recentFeed[0].views) + ' views — study what made it work.' : ''}
            </div>
          </div>
        </div>
      `;
    }
  }

  // ── Growth Goals ──
  const currentFollowers = Object.values(d.metrics?.platforms || {}).reduce((s, p) => s + (p.followers || p.pageLikes || 0), 0);
  const growthGoals = [
    { label: 'Reach 50K total followers', target: 50000, current: currentFollowers, icon: '👥' },
    { label: 'Reach 10K TT avg views', target: 10000, current: (() => { const tt = d.posts?.platforms?.tiktok || []; return tt.length > 0 ? Math.round(tt.reduce((s,p) => s + (p.views||0), 0) / tt.length) : 0; })(), icon: '👁️' },
    { label: 'Complete 10 tasks', target: 10, current: completedTasks, icon: '✅' },
    { label: 'Publish 50 pieces of content', target: 50, current: totalContent, icon: '📱' },
  ];

  const goalsHtml = growthGoals.map(g => {
    const pct = Math.min(100, (g.current / g.target * 100)).toFixed(0);
    const barColor = pct >= 100 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#EF4444';
    return `
      <div style="${DS.card}; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:13px; color:#475569;">${g.icon} ${g.label}</span>
          <span style="color:${barColor}; font-size:13px; font-weight:600;">${fmt(g.current)} / ${fmt(g.target)} (${pct}%)</span>
        </div>
        <div style="height:8px; background:#F1F5F9; border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:4px; transition:width 0.5s;"></div>
        </div>
      </div>
    `;
  }).join('');

  // ── Task Board ──
  function renderTasks() {
    if (tasks.length === 0) return '<p style="' + DS.muted + '">No tasks yet. Add your first task to earn XP!</p>';
    const categories = { filming: '🎬', content: '📝', strategy: '📊', meeting: '📅', other: '📌' };

    return tasks.map((t, i) => `
      <div style="${DS.card}; display:flex; align-items:center; gap:12px; margin-bottom:8px; ${t.done ? 'opacity:0.5;' : ''} border-left:3px solid ${t.done ? '#22C55E' : t.priority === 'high' ? '#EF4444' : t.priority === 'medium' ? '#F59E0B' : '#22C55E'}; padding:12px 16px;">
        <input type="checkbox" ${t.done ? 'checked' : ''} data-task-idx="${i}" style="width:18px; height:18px; cursor:pointer; accent-color:${DS.brand};" />
        <div style="flex:1;">
          <div style="color:${t.done ? '#94A3B8' : '#1E293B'}; font-weight:500; ${t.done ? 'text-decoration:line-through;' : ''}">${categories[t.category] || '📌'} ${t.text}</div>
          <div style="${DS.muted}">
            ${t.priority === 'high' ? '<span style="color:#EF4444; font-weight:600;">HIGH</span>' : t.priority === 'medium' ? '<span style="color:#F59E0B;">MED</span>' : '<span style="color:#22C55E;">LOW</span>'}
            · ${t.category} · ${t.dueDate ? 'Due: ' + t.dueDate : 'No deadline'}
            ${t.done ? ' · <span style="color:#22C55E;">+' + xpPerTask + ' XP</span>' : ''}
          </div>
        </div>
        <button data-task-delete="${i}" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:16px;">✕</button>
      </div>
    `).join('');
  }

  // ── 90-Day Milestones ──
  const milestones = [
    { day: 7, label: 'Week 1: Audit & Baseline', desc: 'Complete competitor scrape, establish baseline metrics, identify top 3 content gaps', xp: 50, unlocks: 'Content Gap Report' },
    { day: 14, label: 'Week 2: Content Experiments', desc: 'Test 3 new content formats identified from competitor analysis (behind-the-scenes, Q&A, reaction)', xp: 75, unlocks: 'Format Testing Badge' },
    { day: 30, label: 'Month 1: Review & Optimise', desc: 'Analyse first month of tracked data, double down on winning formats, cut underperformers', xp: 100, unlocks: 'Data-Driven Creator' },
    { day: 45, label: 'Week 6: Cross-Platform Push', desc: 'Repurpose top TikTok content for IG Reels, launch FB engagement strategy', xp: 100, unlocks: 'Multi-Platform Master' },
    { day: 60, label: 'Month 2: Growth Sprint', desc: 'Implement collaboration/duet strategy, test paid amplification on top organic posts', xp: 150, unlocks: 'Growth Hacker' },
    { day: 90, label: 'Month 3: Scale & Systemise', desc: 'Review full quarter, build repeatable content calendar, set next quarter targets', xp: 200, unlocks: 'Strategy Legend' },
  ];

  const milestonesHtml = milestones.map((m, idx) => {
    const targetDate = new Date(new Date());
    targetDate.setDate(targetDate.getDate() + m.day);
    const isPast = targetDate < new Date();
    const isNext = !isPast && (idx === 0 || new Date(new Date().setDate(new Date().getDate() + milestones[idx - 1].day)) < new Date());
    return `
      <div style="${DS.card}; border-left:3px solid ${isPast ? '#22C55E' : isNext ? '#F59E0B' : '#E2E8F0'}; padding:14px 18px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:600; font-size:14px; color:${isPast ? '#22C55E' : '#1E293B'};">${isPast ? '✅' : isNext ? '👉' : '🔒'} ${m.label}</span>
          <span style="${DS.muted}">${fmtDate(targetDate.toISOString())}</span>
        </div>
        <div style="color:#475569; font-size:13px;">${m.desc}</div>
        <div style="display:flex; gap:12px; margin-top:6px; font-size:11px;">
          <span style="color:#F59E0B; font-weight:600;">+${m.xp} XP</span>
          <span style="color:${DS.brand};">🔓 Unlocks: ${m.unlocks}</span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="padding:4px 0;">
      <h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:20px;">🎯 Strategy & Tasks</h2>

      <!-- XP / Level Bar -->
      <div style="${DS.card}; margin-bottom:20px; border-top:3px solid ${DS.brand};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <span style="font-size:32px;">${currentLevel.icon}</span>
            <span style="font-size:22px; font-weight:700; color:#1E293B; margin-left:8px;">${currentLevel.name}</span>
            <span style="${DS.muted}; margin-left:8px; font-size:14px;">Level ${levels.indexOf(currentLevel) + 1}</span>
          </div>
          <div style="text-align:right;">
            <div style="color:${DS.brand}; font-size:24px; font-weight:700;">${totalXP.toLocaleString()} XP</div>
            <div style="${DS.muted}">${xpToNext > 0 ? xpToNext + ' XP to ' + nextLevel.icon + ' ' + nextLevel.name : 'MAX LEVEL'}</div>
          </div>
        </div>
        <div style="height:12px; background:#F1F5F9; border-radius:6px; overflow:hidden; margin-bottom:10px;">
          <div style="height:100%; width:${levelProgress}%; background:linear-gradient(90deg, ${DS.brand}, #A78BFA); border-radius:6px; transition:width 0.5s;"></div>
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; ${DS.muted}">
          <span>📝 Tasks: +${xpFromTasks} XP</span>
          <span>📱 Content: +${xpFromContent} XP</span>
          <span>📈 Growth: +${xpFromGrowth} XP</span>
          <span style="margin-left:auto;">🔥 Streak: ${streakData.current} day${streakData.current !== 1 ? 's' : ''} (best: ${streakData.best})</span>
        </div>
      </div>

      <!-- Competitor FOMO -->
      ${fomoHtml}

      <!-- ═══ AI Topic Research ═══ -->
      <div style="${DS.card}; margin-bottom:24px;">
        <h3 style="${DS.sectionTitle}; display:flex; align-items:center; gap:8px;">🔬 AI Topic Research</h3>
        <p style="${DS.muted}; margin-bottom:14px;">Enter topics or script ideas (one per line) and get AI-powered trend analysis, priority ranking, and a structured filming list.</p>
        <textarea id="topic-research-input" placeholder="Enter topics, one per line&#10;e.g.&#10;MRI anxiety relief&#10;workplace injury prevention&#10;red light therapy benefits&#10;physio vs chiropractor" style="${DS.input}; width:100%; min-height:100px; resize:vertical; box-sizing:border-box; margin-bottom:10px;"></textarea>
        <textarea id="topic-research-context" placeholder="Optional: add extra context about your goals, audience, or what you're trying to achieve..." style="${DS.input}; width:100%; min-height:60px; resize:vertical; box-sizing:border-box; margin-bottom:12px; color:#475569;"></textarea>
        <button data-action="run-topic-research" style="${DS.btnPrimary}">🔬 Analyse Topics</button>
        <div id="topic-research-results" style="margin-top:16px;">
          ${d.topicResearch ? renderTopicResearchResults(d.topicResearch) : ''}
        </div>
      </div>

      <!-- ═══ Structured Tasks & Strategy Sections ═══ -->
      ${renderStructuredSection('goals', '🎯 Goals', 'Add a goal (e.g. "Reach 5K followers by Q3")', structuredTasks.goals || [])}
      ${renderStructuredSection('strategy', '📝 Strategy', 'Add a strategy note (e.g. "Focus on educational Reels")', structuredTasks.strategy || [])}
      ${renderStructuredSection('filmingStyle', '🎬 Filming Style', 'Add a filming direction (e.g. "Cinematic B-roll, talking head")', structuredTasks.filmingStyle || [])}
      ${renderDocumentsSection(structuredTasks.documents || [])}
      ${renderActionablesSection(structuredTasks.actionables || [])}

      <!-- Growth Goals -->
      <div style="margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
          <h3 style="${DS.sectionTitle}; margin-bottom:0;">📊 Growth Targets</h3>
          <span style="${DS.muted}">Hit these to level up</span>
        </div>
        ${goalsHtml}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <!-- Left: Quick Tasks -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <h3 style="${DS.sectionTitle}; margin-bottom:0;">📋 Quick Task Board</h3>
            <span style="color:${DS.brand}; font-size:12px; font-weight:400;">+${xpPerTask} XP per task</span>
          </div>
          <div style="${DS.card}; margin-bottom:16px;">
            <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
              <input type="text" id="task-input" placeholder="New task (e.g., Film Episode 34)" style="${DS.input}; flex:1; min-width:200px;" />
              <select id="task-category" style="${DS.select}">
                <option value="filming">🎬 Filming</option>
                <option value="content">📝 Content</option>
                <option value="strategy">📊 Strategy</option>
                <option value="meeting">📅 Meeting</option>
                <option value="other">📌 Other</option>
              </select>
              <select id="task-priority" style="${DS.select}">
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
              <input type="date" id="task-due" style="${DS.input}; padding:8px; font-size:13px;" />
              <button data-action="add-task" style="${DS.btnPrimary}; padding:8px 16px;">+ Add</button>
            </div>
            <div id="task-list">
              ${renderTasks()}
            </div>
          </div>
        </div>

        <!-- Right: 90-Day Strategy -->
        <div>
          <h3 style="${DS.sectionTitle}">🗓️ 90-Day Strategy Roadmap</h3>
          <div style="display:flex; flex-direction:column; gap:0;">
            ${milestonesHtml}
          </div>
        </div>
      </div>
    </div>
  `;
};

// ── Structured section renderer (Goals, Strategy, Filming Style) ──
function renderStructuredSection(sectionKey, title, placeholder, items) {
  const itemsHtml = items.length === 0
    ? '<p style="' + DS.muted + '; padding:8px 0;">No items yet. Add your first one above.</p>'
    : items.map(item => `
      <div style="${DS.card}; margin-bottom:8px; border-left:3px solid ${DS.brand}; padding:14px 18px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1;">
            <div style="font-size:14px; font-weight:500; color:#1E293B; margin-bottom:4px;">${escHtml(item.text)}</div>
            ${item.notes ? '<div style="' + DS.muted + '; line-height:1.4; margin-top:4px;">' + escHtml(item.notes) + '</div>' : ''}
            <div style="' + DS.muted + '; font-size:11px; margin-top:6px;">Added ${fmtDate(item.createdAt)}</div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button data-strat-edit="${sectionKey}:${item.id}" style="background:none; border:none; color:${DS.brand}; cursor:pointer; font-size:14px;" title="Edit">✏️</button>
            <button data-strat-delete="${sectionKey}:${item.id}" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:14px;" title="Delete">✕</button>
          </div>
        </div>
        <div id="strat-edit-row-${item.id}" style="display:none; flex-direction:column; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid #F1F5F9;">
          <input type="text" id="strat-edit-text-${item.id}" value="${escAttr(item.text)}" style="${DS.input}; width:100%;" />
          <input type="text" id="strat-edit-notes-${item.id}" value="${escAttr(item.notes || '')}" placeholder="Notes (optional)" style="${DS.input}; width:100%;" />
          <button data-strat-save="${sectionKey}:${item.id}" style="${DS.btnPrimary}; padding:6px 14px; font-size:12px; align-self:flex-start;">Save</button>
        </div>
      </div>
    `).join('');

  return `
    <div style="${DS.card}; margin-bottom:20px;">
      <h3 style="${DS.sectionTitle}; display:flex; align-items:center; gap:8px;">
        ${title}
        <span style="${DS.muted}; font-weight:400;">${items.length} item${items.length !== 1 ? 's' : ''}</span>
      </h3>
      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <input type="text" id="strat-input-${sectionKey}" placeholder="${placeholder}" style="${DS.input}; flex:1; min-width:250px;" />
        <input type="text" id="strat-notes-${sectionKey}" placeholder="Notes (optional)" style="${DS.input}; flex:0.6; min-width:150px;" />
        <button class="tab" data-action="strat-add-${sectionKey}" style="${DS.btnPrimary}">+ Add</button>
      </div>
      ${itemsHtml}
    </div>
  `;
}

// ── Documents & Links section ──
function renderDocumentsSection(items) {
  const itemsHtml = items.length === 0
    ? '<p style="' + DS.muted + '; padding:8px 0;">No documents or links yet. Add references, brand guides, or useful URLs.</p>'
    : items.map(item => `
      <div style="${DS.card}; margin-bottom:8px; border-left:3px solid #F59E0B; padding:14px 18px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1;">
            <div style="font-size:14px; font-weight:500; color:#1E293B; margin-bottom:4px;">📎 ${escHtml(item.text)}</div>
            ${item.url ? '<a href="' + escAttr(item.url) + '" target="_blank" style="color:' + DS.brand + '; font-size:12px; text-decoration:none; word-break:break-all;">' + escHtml(item.url) + '</a>' : ''}
            ${item.notes ? '<div style="' + DS.muted + '; line-height:1.4; margin-top:4px;">' + escHtml(item.notes) + '</div>' : ''}
            <div style="' + DS.muted + '; font-size:11px; margin-top:6px;">Added ${fmtDate(item.createdAt)}</div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button data-strat-edit="documents:${item.id}" style="background:none; border:none; color:${DS.brand}; cursor:pointer; font-size:14px;" title="Edit">✏️</button>
            <button data-strat-delete="documents:${item.id}" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:14px;" title="Delete">✕</button>
          </div>
        </div>
        <div id="strat-edit-row-${item.id}" style="display:none; flex-direction:column; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid #F1F5F9;">
          <input type="text" id="strat-edit-text-${item.id}" value="${escAttr(item.text)}" style="${DS.input}; width:100%;" />
          <input type="text" id="strat-edit-url-${item.id}" value="${escAttr(item.url || '')}" placeholder="URL or file path" style="${DS.input}; width:100%;" />
          <input type="text" id="strat-edit-notes-${item.id}" value="${escAttr(item.notes || '')}" placeholder="Notes (optional)" style="${DS.input}; width:100%;" />
          <button data-strat-save="documents:${item.id}" style="${DS.btnPrimary}; padding:6px 14px; font-size:12px; align-self:flex-start;">Save</button>
        </div>
      </div>
    `).join('');

  return `
    <div style="${DS.card}; margin-bottom:20px;">
      <h3 style="${DS.sectionTitle}; display:flex; align-items:center; gap:8px;">
        📄 Documents & Links
        <span style="${DS.muted}; font-weight:400;">${items.length} item${items.length !== 1 ? 's' : ''}</span>
      </h3>
      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <input type="text" id="strat-input-documents" placeholder="Document title (e.g. Brand Guidelines)" style="${DS.input}; flex:1; min-width:200px;" />
        <input type="text" id="strat-url-documents" placeholder="URL or file path" style="${DS.input}; flex:0.8; min-width:200px;" />
        <input type="text" id="strat-notes-documents" placeholder="Notes (optional)" style="${DS.input}; flex:0.5; min-width:120px;" />
        <button class="tab" data-action="strat-add-documents" style="${DS.btnPrimary}; background:#F59E0B; box-shadow:0 2px 8px rgba(245,158,11,0.25);">+ Add</button>
      </div>
      ${itemsHtml}
    </div>
  `;
}

// ── Actionables section with status checkboxes ──
function renderActionablesSection(items) {
  const statusConfig = {
    pending:       { label: 'Pending',     colour: '#EF4444', bg: 'rgba(239,68,68,0.06)', icon: '⏳' },
    'in-progress': { label: 'In Progress', colour: '#F59E0B', bg: 'rgba(245,158,11,0.06)', icon: '🔄' },
    done:          { label: 'Done',        colour: '#22C55E', bg: 'rgba(34,197,94,0.06)', icon: '✅' },
  };

  const pending = items.filter(i => i.status === 'pending');
  const inProgress = items.filter(i => i.status === 'in-progress');
  const done = items.filter(i => i.status === 'done');

  const itemsHtml = items.length === 0
    ? '<p style="' + DS.muted + '; padding:8px 0;">No actionable items yet. Add tasks to track progress.</p>'
    : items.map(item => {
        const s = statusConfig[item.status] || statusConfig.pending;
        return `
          <div style="${DS.card}; margin-bottom:8px; border-left:3px solid ${s.colour}; padding:14px 18px; ${item.status === 'done' ? 'opacity:0.6;' : ''}">
            <div style="display:flex; align-items:flex-start; gap:10px;">
              <button data-actionable-status="${item.id}" style="background:${s.bg}; border:1px solid ${s.colour}22; color:${s.colour}; cursor:pointer; font-size:11px; padding:4px 10px; border-radius:8px; font-weight:600; white-space:nowrap; min-width:90px;" title="Click to cycle status">
                ${s.icon} ${s.label}
              </button>
              <div style="flex:1;">
                <div style="color:${item.status === 'done' ? '#94A3B8' : '#1E293B'}; font-weight:500; font-size:14px; ${item.status === 'done' ? 'text-decoration:line-through;' : ''}">${escHtml(item.text)}</div>
                ${item.notes ? '<div style="' + DS.muted + '; line-height:1.4; margin-top:4px;">' + escHtml(item.notes) + '</div>' : ''}
                <div style="${DS.muted}; font-size:11px; margin-top:6px;">
                  Added ${fmtDate(item.createdAt)}${item.completedAt ? ' · Completed ' + fmtDate(item.completedAt) : ''}
                </div>
              </div>
              <div style="display:flex; gap:4px; flex-shrink:0;">
                <button data-strat-edit="actionables:${item.id}" style="background:none; border:none; color:${DS.brand}; cursor:pointer; font-size:14px;" title="Edit">✏️</button>
                <button data-strat-delete="actionables:${item.id}" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:14px;" title="Delete">✕</button>
              </div>
            </div>
            <div id="strat-edit-row-${item.id}" style="display:none; flex-direction:column; gap:6px; margin-top:10px; padding-top:10px; border-top:1px solid #F1F5F9;">
              <input type="text" id="strat-edit-text-${item.id}" value="${escAttr(item.text)}" style="${DS.input}; width:100%;" />
              <input type="text" id="strat-edit-notes-${item.id}" value="${escAttr(item.notes || '')}" placeholder="Notes (optional)" style="${DS.input}; width:100%;" />
              <button data-strat-save="actionables:${item.id}" style="${DS.btnPrimary}; padding:6px 14px; font-size:12px; align-self:flex-start;">Save</button>
            </div>
          </div>
        `;
      }).join('');

  return `
    <div style="${DS.card}; margin-bottom:20px;">
      <h3 style="${DS.sectionTitle}; display:flex; align-items:center; gap:8px;">
        ✅ Actionables
        <span style="${DS.muted}; font-weight:400;">${items.length} total</span>
      </h3>
      <div style="display:flex; gap:12px; margin-bottom:14px; font-size:12px;">
        <span style="color:#EF4444;">⏳ Pending: ${pending.length}</span>
        <span style="color:#F59E0B;">🔄 In Progress: ${inProgress.length}</span>
        <span style="color:#22C55E;">✅ Done: ${done.length}</span>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <input type="text" id="strat-input-actionables" placeholder="New actionable (e.g. Set up ring light for filming)" style="${DS.input}; flex:1; min-width:250px;" />
        <input type="text" id="strat-notes-actionables" placeholder="Notes (optional)" style="${DS.input}; flex:0.6; min-width:150px;" />
        <button class="tab" data-action="strat-add-actionable" style="${DS.btnPrimary}; background:#22C55E; box-shadow:0 2px 8px rgba(34,197,94,0.25);">+ Add</button>
      </div>
      ${itemsHtml}
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// ██  NOTIFICATION CENTRE
// ═══════════════════════════════════════════════════

window.renderNotifications = function(d, clientId) {
  const alerts = d.alerts?.alerts || [];
  const history = d.alertHistory || [];

  const severityConfig = {
    high:   { icon: '🔴', label: 'Critical',  bg: 'rgba(239,68,68,0.06)',  border: '#EF4444' },
    medium: { icon: '🟡', label: 'Warning',   bg: 'rgba(245,158,11,0.06)', border: '#F59E0B' },
    low:    { icon: '🟢', label: 'Info',       bg: 'rgba(34,197,94,0.06)',  border: '#22C55E' },
  };

  const typeConfig = {
    viral_video:      { icon: '🔥', label: 'Viral Video' },
    follower_spike:   { icon: '📈', label: 'Follower Spike' },
    engagement_spike: { icon: '⚡', label: 'Engagement Surge' },
    new_post:         { icon: '📸', label: 'New Post' },
    trend_detected:   { icon: '📊', label: 'Trend Detected' },
  };

  // Latest alerts section
  var latestHtml = '';
  if (alerts.length === 0) {
    latestHtml = '<div style="text-align:center; padding:40px 20px;"><div style="font-size:48px; margin-bottom:12px; opacity:0.4;">🔔</div><p style="' + DS.muted + '; font-size:14px;">No new competitor alerts</p><p style="' + DS.muted + '">Alerts are generated when competitors have viral posts, follower spikes, or engagement surges.</p></div>';
  } else {
    latestHtml = alerts.map(function(a) {
      var sev = severityConfig[a.severity] || severityConfig.low;
      var typ = typeConfig[a.type] || { icon: '🔔', label: a.type };
      return '<div style="' + DS.card + '; border-left:4px solid ' + sev.border + '; background:' + sev.bg + '; margin-bottom:10px; padding:16px 20px;">'
        + '<div style="display:flex; align-items:flex-start; gap:12px;">'
        + '<div style="font-size:24px; line-height:1;">' + typ.icon + '</div>'
        + '<div style="flex:1;">'
        + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">'
        + '<span style="font-size:13px; font-weight:700; color:#1E293B;">' + escHtml(a.competitor) + '</span>'
        + '<span style="font-size:10px; font-weight:600; color:' + sev.border + '; background:' + sev.bg + '; padding:2px 8px; border-radius:10px; border:1px solid ' + sev.border + ';">' + sev.icon + ' ' + typ.label + '</span>'
        + '<span style="font-size:10px; color:#94A3B8; margin-left:auto;">' + (a.platform || '').toUpperCase() + '</span>'
        + '</div>'
        + '<p style="font-size:13px; color:#475569; margin:0; line-height:1.5;">' + escHtml(a.message) + '</p>'
        + (a.data?.url ? '<a href="' + escAttr(a.data.url) + '" target="_blank" style="font-size:12px; color:' + DS.brand + '; text-decoration:none; font-weight:600; margin-top:6px; display:inline-block;">View post →</a>' : '')
        + (a.data?.views ? '<span style="' + DS.muted + '; margin-left:12px;">' + fmt(a.data.views) + ' views</span>' : '')
        + (a.data?.caption ? '<p style="font-size:11px; color:#94A3B8; margin:6px 0 0; font-style:italic;">"' + escHtml(a.data.caption) + '"</p>' : '')
        + '</div></div></div>';
    }).join('');
  }

  // History section
  var historyHtml = '';
  if (history.length > 0) {
    var sortedHistory = history.slice().sort(function(a, b) {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });

    historyHtml = sortedHistory.slice(0, 20).map(function(a) {
      var sev = severityConfig[a.severity] || severityConfig.low;
      var typ = typeConfig[a.type] || { icon: '🔔', label: a.type };
      var ts = a.timestamp ? new Date(a.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      return '<div style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #F1F5F9;">'
        + '<span style="font-size:16px;">' + typ.icon + '</span>'
        + '<span style="font-size:12px; color:#94A3B8; min-width:60px;">' + ts + '</span>'
        + '<span style="font-size:12px; font-weight:600; color:#1E293B;">' + escHtml(a.competitor) + '</span>'
        + '<span style="font-size:12px; color:#475569; flex:1;">' + escHtml(a.message).slice(0, 80) + '</span>'
        + '<span style="font-size:10px; font-weight:600; color:' + sev.border + ';">' + sev.icon + '</span>'
        + '</div>';
    }).join('');
  }

  // Telegram bot setup info
  var telegramHtml = '<div style="' + DS.card + '; border:1px dashed #7C5CFC; background:rgba(124,92,252,0.03);">'
    + '<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">'
    + '<span style="font-size:28px;">🤖</span>'
    + '<div>'
    + '<h3 style="font-size:14px; font-weight:700; color:#1E293B; margin:0;">Telegram Bot</h3>'
    + '<p style="' + DS.muted + '; margin:0;">Get real-time alerts and daily content recommendations on Telegram</p>'
    + '</div></div>'
    + '<div style="background:#F8FAFC; border-radius:10px; padding:14px 16px; font-size:12px; color:#475569; line-height:1.8;">'
    + '<strong>Setup:</strong><br>'
    + '1. Start the bot: <code style="background:#F1F5F9; padding:2px 6px; border-radius:4px; font-size:11px;">node bot/telegram.js</code><br>'
    + '2. Open Telegram and message <strong>@social_intel_bot</strong><br>'
    + '3. Send <code style="background:#F1F5F9; padding:2px 6px; border-radius:4px; font-size:11px;">/subscribe ' + (clientId || 'client-id') + '</code><br>'
    + '<br><strong>Commands:</strong><br>'
    + '<code>/digest ' + (clientId || 'id') + '</code> — Generate daily content ideas<br>'
    + '<code>/script ' + (clientId || 'id') + ' &lt;topic&gt;</code> — Generate a video script<br>'
    + '<code>/alerts ' + (clientId || 'id') + '</code> — View competitor alerts<br>'
    + '</div></div>';

  return '<div style="max-width:860px;">'
    + '<div style="margin-bottom:24px;">'
    + '<h2 style="font-size:20px; font-weight:700; color:#1E293B; margin:0 0 4px;">🔔 Notification Centre</h2>'
    + '<p style="' + DS.muted + '; margin:0;">Competitor movements, viral posts, and trend alerts</p>'
    + '</div>'

    // Stats row
    + '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin-bottom:20px;">'
    + '<div style="' + DS.card + '; text-align:center;">'
    + '<div style="' + DS.label + '">Active Alerts</div>'
    + '<div style="' + DS.metricValue + '; color:' + (alerts.length > 0 ? '#EF4444' : '#22C55E') + ';">' + alerts.length + '</div>'
    + '</div>'
    + '<div style="' + DS.card + '; text-align:center;">'
    + '<div style="' + DS.label + '">High Priority</div>'
    + '<div style="' + DS.metricValue + '; color:#EF4444;">' + alerts.filter(function(a) { return a.severity === 'high'; }).length + '</div>'
    + '</div>'
    + '<div style="' + DS.card + '; text-align:center;">'
    + '<div style="' + DS.label + '">Total History</div>'
    + '<div style="' + DS.metricValue + '">' + history.length + '</div>'
    + '</div></div>'

    // Latest alerts
    + '<div style="' + DS.card + '; margin-bottom:20px;">'
    + '<h3 style="' + DS.sectionTitle + '; display:flex; align-items:center; gap:8px;">🚨 Latest Alerts'
    + (alerts.length > 0 ? '<span style="background:#EF4444; color:#fff; font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px;">' + alerts.length + ' new</span>' : '')
    + '</h3>'
    + latestHtml
    + '</div>'

    // Exa Trend Research
    + (function() {
      var trends = d.trends?.trends?.trends || [];
      var compNews = d.trends?.competitorNews || [];
      if (trends.length === 0 && compNews.length === 0) return '';

      var trendsCards = trends.slice(0, 6).map(function(t) {
        var vpColor = t.viralPotential === 'High' ? '#EF4444' : t.viralPotential === 'Medium' ? '#F59E0B' : '#22C55E';
        return '<div style="' + DS.card + '; border-left:3px solid ' + vpColor + '; padding:14px 16px; margin-bottom:8px;">'
          + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">'
          + '<span style="font-size:14px; font-weight:700; color:#1E293B;">' + escHtml(t.topic) + '</span>'
          + '<span style="font-size:10px; font-weight:600; color:' + vpColor + '; background:' + vpColor + '11; padding:2px 8px; border-radius:10px;">' + (t.viralPotential || '?') + ' viral</span>'
          + (t.platform ? '<span style="' + DS.muted + '">' + escHtml(t.platform) + '</span>' : '')
          + '</div>'
          + '<p style="font-size:12px; color:#475569; margin:0; line-height:1.5;">' + escHtml((t.description || '').slice(0, 150)) + '</p>'
          + '</div>';
      }).join('');

      var newsCards = compNews.slice(0, 5).map(function(n) {
        return '<div style="display:flex; gap:10px; padding:8px 0; border-bottom:1px solid #F1F5F9;">'
          + '<span style="font-size:12px; font-weight:600; color:#1E293B; min-width:100px;">' + escHtml(n.competitor || '') + '</span>'
          + '<div style="flex:1;">'
          + '<a href="' + escAttr(n.url || '') + '" target="_blank" style="font-size:12px; color:' + DS.brand + '; text-decoration:none; font-weight:500;">' + escHtml((n.title || '').slice(0, 80)) + ' ↗</a>'
          + (n.publishedDate ? '<span style="' + DS.muted + '; margin-left:8px;">' + n.publishedDate.slice(0, 10) + '</span>' : '')
          + '</div></div>';
      }).join('');

      return '<div style="' + DS.card + '; margin-bottom:20px; border:1px solid rgba(124,92,252,0.2); background:rgba(124,92,252,0.02);">'
        + '<h3 style="' + DS.sectionTitle + '; display:flex; align-items:center; gap:8px;">🔍 Trend Research <span style="font-size:10px; font-weight:500; color:#94A3B8; background:#F1F5F9; padding:2px 8px; border-radius:8px;">Powered by Exa</span></h3>'
        + (trends.length > 0 ? '<div style="margin-bottom:16px;"><div style="' + DS.label + '; margin-bottom:8px;">🔥 Trending Topics</div>' + trendsCards + '</div>' : '')
        + (compNews.length > 0 ? '<div><div style="' + DS.label + '; margin-bottom:8px;">📰 Competitor News</div>' + newsCards + '</div>' : '')
        + '<div style="' + DS.muted + '; margin-top:10px; font-size:10px;">Last researched: ' + (d.trends?.researchedAt ? new Date(d.trends.researchedAt).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : 'Not yet') + '</div>'
        + '</div>';
    })()

    // History
    + (history.length > 0 ? '<div style="' + DS.card + '; margin-bottom:20px;">'
    + '<h3 style="' + DS.sectionTitle + '">📜 Alert History</h3>'
    + historyHtml
    + '</div>' : '')

    // Telegram
    + telegramHtml
    + '</div>';
};

// ── HTML escaping helpers ──
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
