/**
 * Intelligence Layer — Dashboard tab renderers
 * Adds Content Intel, Hook Lab, and Opportunities tabs to the existing dashboard.
 * These are vanilla JS functions that return HTML strings, matching the tabs.js pattern.
 */

// ═══════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════

function healthRingSvg(score, size) {
  size = size || 120;
  var r = (size - 12) / 2;
  var circ = 2 * Math.PI * r;
  var pct = Math.max(0, Math.min(100, score || 0));
  var offset = circ - (circ * pct / 100);
  var color = pct >= 75 ? '#00E5A0' : pct >= 50 ? '#FFB547' : '#FF5C5C';
  return '<div class="health-ring" style="width:' + size + 'px; height:' + size + 'px;">'
    + '<svg width="' + size + '" height="' + size + '">'
    + '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="#F1F5F9" stroke-width="10"/>'
    + '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" '
    + 'stroke-dasharray="' + circ + '" stroke-dashoffset="' + offset + '" stroke-linecap="round"/>'
    + '</svg>'
    + '<span class="health-ring__label" style="color:' + color + ';">' + pct + '</span>'
    + '</div>';
}

function intelCard(title, content, accentColor) {
  var accent = accentColor ? 'border-top:3px solid ' + accentColor + ';' : '';
  return '<div class="intel-card" style="' + accent + '">'
    + (title ? '<div style="font-size:13px; font-weight:700; color:#475569; margin-bottom:10px;">' + title + '</div>' : '')
    + content
    + '</div>';
}

function perfBar(value, max, color) {
  var pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return '<div class="perf-bar">'
    + '<div class="perf-bar__fill" style="width:' + pct + '%; background:' + (color || '#7C5CFC') + ';"></div>'
    + '</div>';
}

function sparkMini(values, color) {
  if (!values || values.length < 2) return '';
  var w = 80, h = 24;
  var mn = Math.min.apply(null, values);
  var mx = Math.max.apply(null, values);
  var rng = mx - mn || 1;
  var pts = values.map(function(v, i) {
    return (i * w / (values.length - 1)).toFixed(1) + ',' + (h - ((v - mn) / rng * h)).toFixed(1);
  }).join(' ');
  return '<svg width="' + w + '" height="' + h + '" style="display:block;">'
    + '<polyline points="' + pts + '" fill="none" stroke="' + (color || '#7C5CFC') + '" stroke-width="2"/>'
    + '</svg>';
}

// ═══════════════════════════════════════════════════
// TAB: Content Intel
// ═══════════════════════════════════════════════════
window.renderContentIntel = function(intelData) {
  if (!intelData || !intelData.contentPerformance || intelData.contentPerformance.length === 0) {
    return '<div style="padding:40px; text-align:center;">'
      + '<div style="font-size:48px; margin-bottom:12px;">🧠</div>'
      + '<div style="font-size:16px; font-weight:700; color:#1E293B; margin-bottom:8px;">No Intelligence Data Yet</div>'
      + '<div style="color:#94A3B8; margin-bottom:16px;">Run AI classification to analyse your content performance.</div>'
      + '<button onclick="window.runClassification()" style="background:#7C5CFC; color:white; border:none; padding:10px 24px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">🔬 Run Classification</button>'
      + '</div>';
  }

  var cp = intelData.contentPerformance;
  var maxPerf = Math.max.apply(null, cp.map(function(c) { return parseFloat(c.performance_index) || 0; }));

  // Content type matrix
  var matrixRows = cp.map(function(c) {
    var sentColor = c.avg_sentiment >= 70 ? '#00E5A0' : c.avg_sentiment >= 40 ? '#FFB547' : '#FF5C5C';
    return '<tr style="border-bottom:1px solid #F1F5F9;">'
      + '<td style="padding:10px 12px; font-weight:600; font-size:13px;">' + c.content_type + '</td>'
      + '<td style="padding:10px 8px; text-align:center;">' + c.post_count + ' <span style="color:#94A3B8; font-size:11px;">(' + c.post_percentage + '%)</span></td>'
      + '<td style="padding:10px 8px; text-align:center; font-weight:600;">' + c.avg_engagement_rate + '%</td>'
      + '<td style="padding:10px 8px; text-align:center;">' + (c.avg_views > 0 ? (c.avg_views >= 1000 ? (c.avg_views / 1000).toFixed(1) + 'K' : c.avg_views) : '—') + '</td>'
      + '<td style="padding:10px 8px; text-align:center;"><span style="color:' + sentColor + '; font-weight:600;">' + c.avg_sentiment + '</span></td>'
      + '<td style="padding:10px 8px; width:100px;">' + perfBar(parseFloat(c.performance_index), maxPerf, '#7C5CFC') + '</td>'
      + '<td style="padding:10px 8px; text-align:center; font-weight:700; color:#7C5CFC;">' + c.performance_index + '</td>'
      + '</tr>';
  }).join('');

  var matrixHtml = '<div style="overflow-x:auto;">'
    + '<table style="width:100%; border-collapse:collapse; font-size:13px;">'
    + '<thead><tr style="border-bottom:2px solid #E2E8F0;">'
    + '<th style="padding:8px 12px; text-align:left; color:#94A3B8; font-weight:600;">Content Type</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Posts</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Eng Rate</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Avg Views</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Sentiment</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Performance</th>'
    + '<th style="padding:8px; text-align:center; color:#94A3B8; font-weight:600;">Index</th>'
    + '</tr></thead><tbody>' + matrixRows + '</tbody></table></div>';

  // Top insights
  var topType = cp[0];
  var insightCards = '';
  if (topType) {
    insightCards += intelCard('🏆 Top Performer',
      '<div style="font-size:20px; font-weight:700; color:#1E293B;">' + topType.content_type + '</div>'
      + '<div style="color:#94A3B8; font-size:12px; margin-top:4px;">' + topType.avg_engagement_rate + '% engagement · ' + topType.post_count + ' posts · Perf index ' + topType.performance_index + '</div>',
      '#00E5A0');
  }
  if (cp.length > 1) {
    var worstType = cp[cp.length - 1];
    insightCards += intelCard('📉 Lowest Performer',
      '<div style="font-size:20px; font-weight:700; color:#1E293B;">' + worstType.content_type + '</div>'
      + '<div style="color:#94A3B8; font-size:12px; margin-top:4px;">' + worstType.avg_engagement_rate + '% engagement · ' + worstType.post_count + ' posts</div>',
      '#FF5C5C');
  }

  return '<div style="padding:4px 0;">'
    + '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">'
    + '<h2 style="font-size:20px; font-weight:700; color:#1E293B;">🧠 Content Intelligence</h2>'
    + '<button onclick="window.runClassification()" style="background:#7C5CFC; color:white; border:none; padding:8px 16px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">🔬 Re-classify</button>'
    + '</div>'
    + '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">' + insightCards + '</div>'
    + '<div class="intel-card" style="margin-bottom:20px;">'
    + '<div style="font-size:14px; font-weight:700; color:#1E293B; margin-bottom:12px;">📊 Content Type Performance Matrix</div>'
    + matrixHtml
    + '</div>'
    + '</div>';
};

// ═══════════════════════════════════════════════════
// TAB: Hook Lab
// ═══════════════════════════════════════════════════
window.renderHookLab = function(intelData) {
  if (!intelData || !intelData.hookPerformance || intelData.hookPerformance.length === 0) {
    return '<div style="padding:40px; text-align:center;">'
      + '<div style="font-size:48px; margin-bottom:12px;">🎣</div>'
      + '<div style="font-size:16px; font-weight:700; color:#1E293B; margin-bottom:8px;">No Hook Data Yet</div>'
      + '<div style="color:#94A3B8; margin-bottom:16px;">Run AI classification first to analyse hook performance.</div>'
      + '<button onclick="window.runClassification()" style="background:#7C5CFC; color:white; border:none; padding:10px 24px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">🔬 Run Classification</button>'
      + '</div>';
  }

  var hp = intelData.hookPerformance;
  var maxEng = Math.max.apply(null, hp.map(function(h) { return parseFloat(h.avg_engagement_rate) || 0; }));

  var hookCards = hp.map(function(h, idx) {
    var isBest = h.best_performer;
    var borderColor = isBest ? '#00E5A0' : parseFloat(h.avg_engagement_rate) < 1 ? '#FF5C5C' : '#E2E8F0';
    var badge = isBest ? '<span style="background:#00E5A0; color:white; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700;">WINNING</span>'
      : (h.use_count >= 3 && parseFloat(h.avg_engagement_rate) < 1)
        ? '<span style="background:#FF5C5C; color:white; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700;">RETIRE?</span>'
        : '';

    return '<div style="border:1px solid ' + borderColor + '; border-radius:12px; padding:14px; background:white;">'
      + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">'
      + '<span style="font-weight:700; font-size:14px; color:#1E293B;">' + h.hook_type + '</span>'
      + badge
      + '</div>'
      + '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px;">'
      + '<div style="text-align:center;"><div style="color:#94A3B8; font-size:10px;">USED</div><div style="font-weight:700; font-size:16px;">' + h.use_count + 'x</div></div>'
      + '<div style="text-align:center;"><div style="color:#94A3B8; font-size:10px;">ENG RATE</div><div style="font-weight:700; font-size:16px; color:#7C5CFC;">' + h.avg_engagement_rate + '%</div></div>'
      + '<div style="text-align:center;"><div style="color:#94A3B8; font-size:10px;">RETENTION</div><div style="font-weight:700; font-size:16px;">' + h.avg_retention_pct + '%</div></div>'
      + '</div>'
      + perfBar(parseFloat(h.avg_engagement_rate), maxEng, isBest ? '#00E5A0' : '#7C5CFC')
      + '</div>';
  }).join('');

  return '<div style="padding:4px 0;">'
    + '<h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:4px;">🎣 Hook Lab</h2>'
    + '<p style="color:#94A3B8; font-size:13px; margin-bottom:20px;">Which hooks keep viewers watching? Data from AI classification of your posts.</p>'
    + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">'
    + hookCards
    + '</div>'
    + '</div>';
};

// ═══════════════════════════════════════════════════
// TAB: Opportunities
// ═══════════════════════════════════════════════════
window.renderOpportunities = function(intelData) {
  if (!intelData || !intelData.opportunities || intelData.opportunities.length === 0) {
    return '<div style="padding:40px; text-align:center;">'
      + '<div style="font-size:48px; margin-bottom:12px;">💡</div>'
      + '<div style="font-size:16px; font-weight:700; color:#1E293B; margin-bottom:8px;">No Opportunities Yet</div>'
      + '<div style="color:#94A3B8; margin-bottom:16px;">Run AI classification to generate personalised content opportunities.</div>'
      + '<button onclick="window.runClassification()" style="background:#7C5CFC; color:white; border:none; padding:10px 24px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer;">🔬 Run Classification</button>'
      + '</div>';
  }

  var opps = intelData.opportunities;
  var oppCards = opps.map(function(o) {
    return '<div class="opp-card" style="border-left-color:' + (o.accent_color || '#7C5CFC') + ';">'
      + '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">'
      + '<span style="font-size:20px;">' + (o.icon || '💡') + '</span>'
      + '<span class="opp-card__title" style="color:#1E293B;">' + o.title + '</span>'
      + '</div>'
      + '<div style="color:#64748B; font-size:13px; line-height:1.5;">' + o.description + '</div>'
      + '<div class="opp-card__action" style="background:' + (o.accent_color || '#7C5CFC') + '18; color:' + (o.accent_color || '#7C5CFC') + ';">' + o.action_text + '</div>'
      + '</div>';
  }).join('');

  // Health score ring at top
  var hs = intelData.healthScore || {};
  var healthHtml = '';
  if (hs.health_score != null) {
    var trendIcon = hs.trend === 'up' ? '↑' : hs.trend === 'down' ? '↓' : '→';
    var trendColor = hs.trend === 'up' ? '#00E5A0' : hs.trend === 'down' ? '#FF5C5C' : '#94A3B8';
    var breakdown = hs.score_breakdown || {};
    var breakdownHtml = Object.entries(breakdown).map(function(e) {
      var barColor = e[1] >= 75 ? '#00E5A0' : e[1] >= 50 ? '#FFB547' : '#FF5C5C';
      return '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">'
        + '<span style="width:80px; font-size:12px; color:#64748B; text-transform:capitalize;">' + e[0] + '</span>'
        + '<div style="flex:1;">' + perfBar(e[1], 100, barColor) + '</div>'
        + '<span style="font-size:12px; font-weight:600; width:30px; text-align:right;">' + e[1] + '</span>'
        + '</div>';
    }).join('');

    healthHtml = '<div class="intel-card" style="display:flex; gap:24px; align-items:center; margin-bottom:20px; border-top:3px solid #7C5CFC;">'
      + '<div style="text-align:center;">'
      + healthRingSvg(hs.health_score, 120)
      + '<div style="font-size:11px; color:#94A3B8; margin-top:4px;">Health Score</div>'
      + '<div style="color:' + trendColor + '; font-size:13px; font-weight:600;">' + trendIcon + ' ' + hs.trend + '</div>'
      + '</div>'
      + '<div style="flex:1;">'
      + '<div style="font-weight:700; color:#1E293B; margin-bottom:10px;">Score Breakdown</div>'
      + breakdownHtml
      + '</div>'
      + '</div>';
  }

  return '<div style="padding:4px 0;">'
    + '<h2 style="font-size:20px; font-weight:700; color:#1E293B; margin-bottom:4px;">💡 Opportunities</h2>'
    + '<p style="color:#94A3B8; font-size:13px; margin-bottom:20px;">AI-generated action items based on your content analysis.</p>'
    + healthHtml
    + oppCards
    + '</div>';
};
