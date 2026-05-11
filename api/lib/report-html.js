/**
 * Brand Strategy Report — self-contained HTML template
 * Used for both browser download and PDF generation
 */

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build full HTML document for the brand report
 * @param {object} data - The report data object (from brand-report-latest.json)
 * @param {object} agency - Agency branding config { name, tagline, logoUrl, accentColor, website }
 * @returns {string} Complete HTML document
 */
export function buildReportHtml(data, agency = {}) {
  const s = data.structured;
  if (!s) return '<html><body><p>No structured report data.</p></body></html>';

  const accent = agency.accentColor || '#7C5CFC';
  const agencyName = agency.name || 'Social Intelligence';
  const agencyTagline = agency.tagline || 'Data-Driven Content Strategy';
  const logoHtml = agency.logoUrl
    ? `<img src="${esc(agency.logoUrl)}" alt="${esc(agencyName)}" style="max-height:48px; max-width:200px; object-fit:contain;" />`
    : `<div style="font-size:24px; font-weight:800; color:${accent}; letter-spacing:-0.02em;">${esc(agencyName)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(s.report_title || 'Brand Strategy Report')}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'DM Sans',system-ui,sans-serif; color:#1E293B; background:#fff; line-height:1.6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  /* Cover page */
  .cover { height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; page-break-after:always; background:linear-gradient(135deg, ${accent}08 0%, ${accent}03 100%); position:relative; }
  .cover-logo { margin-bottom:48px; }
  .cover h1 { font-size:36px; font-weight:800; color:#1E293B; margin-bottom:8px; letter-spacing:-0.02em; }
  .cover h2 { font-size:20px; font-weight:500; color:#64748B; margin-bottom:48px; }
  .cover-meta { display:flex; gap:32px; font-size:13px; color:#94A3B8; }
  .cover-meta span { display:flex; align-items:center; gap:6px; }
  .cover-confidential { position:absolute; bottom:48px; font-size:11px; color:#CBD5E1; text-transform:uppercase; letter-spacing:0.1em; }
  .cover-line { width:80px; height:4px; background:${accent}; border-radius:2px; margin-bottom:32px; }

  /* Content pages */
  .page { max-width:900px; margin:0 auto; padding:32px 40px; }
  h2 { font-size:18px; font-weight:700; color:${accent}; margin-top:40px; margin-bottom:16px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #F1F5F9; padding-bottom:8px; page-break-after:avoid; }
  h3 { font-size:15px; font-weight:700; color:#1E293B; margin:16px 0 8px; page-break-after:avoid; }
  .card { background:#F8FAFC; border-radius:12px; padding:20px; margin-bottom:16px; border:1px solid #F1F5F9; page-break-inside:avoid; }
  .card-accent { border-left:4px solid ${accent}; }
  .card-warn { border-left:4px solid #EF4444; }
  .card-success { border-left:4px solid #22C55E; }
  .label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#94A3B8; margin-bottom:6px; }
  .pill { display:inline-block; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:600; margin:2px 4px 2px 0; }
  .pill-accent { background:${accent}15; color:${accent}; }
  .pill-red { background:rgba(239,68,68,0.08); color:#EF4444; }
  .pill-green { background:rgba(34,197,94,0.08); color:#22C55E; }
  .pill-amber { background:rgba(245,158,11,0.08); color:#F59E0B; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .metric { text-align:center; padding:16px; background:#fff; border-radius:10px; border:1px solid #F1F5F9; }
  .metric-val { font-size:24px; font-weight:700; color:${accent}; font-family:'JetBrains Mono',monospace; }
  .metric-label { font-size:11px; color:#94A3B8; text-transform:uppercase; margin-top:4px; }
  .hook-box { background:#fff; border:1px solid #E2E8F0; border-radius:8px; padding:12px 16px; margin:8px 0; font-size:13px; font-style:italic; color:#475569; }
  table { width:100%; border-collapse:collapse; margin:12px 0; page-break-inside:avoid; }
  th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; color:#94A3B8; padding:8px 12px; border-bottom:2px solid #F1F5F9; }
  td { padding:8px 12px; font-size:13px; border-bottom:1px solid #F8FAFC; }
  tr:nth-child(even) { background:#FAFBFC; }
  .impact-high { color:#EF4444; font-weight:700; }
  .impact-medium { color:#F59E0B; font-weight:700; }
  .impact-low { color:#22C55E; font-weight:700; }
  .validation { margin-top:8px; padding:8px 12px; border-radius:8px; font-size:12px; }
  .validation-pass { background:rgba(34,197,94,0.06); color:#16A34A; border:1px solid rgba(34,197,94,0.15); }
  .validation-warn { background:rgba(245,158,11,0.06); color:#D97706; border:1px solid rgba(245,158,11,0.15); }
  .validation-fail { background:rgba(239,68,68,0.06); color:#DC2626; border:1px solid rgba(239,68,68,0.15); }
  .toc { page-break-after:always; padding-top:60px; }
  .toc h2 { color:#1E293B; border:none; font-size:22px; margin-bottom:24px; }
  .toc-item { display:flex; justify-content:space-between; align-items:baseline; padding:10px 0; border-bottom:1px solid #F1F5F9; font-size:14px; }
  .toc-num { font-weight:700; color:${accent}; margin-right:12px; font-family:'JetBrains Mono',monospace; }
  .toc-title { font-weight:600; color:#1E293B; }
  .toc-page { color:#94A3B8; font-size:12px; }
  .footer { margin-top:48px; padding-top:24px; border-top:2px solid #F1F5F9; text-align:center; color:#94A3B8; font-size:12px; }
  .footer-brand { display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom:8px; }
  @media print { .cover { height:100vh; } h2 { page-break-before:auto; } }
  @page { margin:1.5cm; }
</style>
</head>
<body>

<!-- COVER PAGE -->
<div class="cover">
  <div class="cover-logo">${logoHtml}</div>
  <div class="cover-line"></div>
  <h1>${esc(s.report_title || 'Brand Strategy Report')}</h1>
  <h2>${esc(agencyTagline)}</h2>
  <div class="cover-meta">
    <span>Prepared for <strong>${esc(data.clientName || data.clientId)}</strong></span>
    <span>${esc(s.generated_date || new Date().toISOString().slice(0, 10))}</span>
    <span>${data.postsAnalysed || 0} posts analysed</span>
    <span>${data.competitorsAnalysed || 0} competitors tracked</span>
  </div>
  <div class="cover-confidential">Confidential — prepared by ${esc(agencyName)}</div>
</div>

<!-- TABLE OF CONTENTS -->
<div class="page toc">
  <h2>Contents</h2>
  <div class="toc-item"><span><span class="toc-num">01</span><span class="toc-title">Brand Identity</span></span></div>
  <div class="toc-item"><span><span class="toc-num">02</span><span class="toc-title">Tone &amp; Pacing</span></span></div>
  <div class="toc-item"><span><span class="toc-num">03</span><span class="toc-title">Edit Style Guide</span></span></div>
  <div class="toc-item"><span><span class="toc-num">04</span><span class="toc-title">Target Audience &amp; ICP</span></span></div>
  <div class="toc-item"><span><span class="toc-num">05</span><span class="toc-title">USP &amp; Contrarian Angles</span></span></div>
  <div class="toc-item"><span><span class="toc-num">06</span><span class="toc-title">Weakness Breakdown &amp; Actionables</span></span></div>
  <div class="toc-item"><span><span class="toc-num">07</span><span class="toc-title">Content Calendar (4 Weeks)</span></span></div>
  ${s.validation ? '<div class="toc-item"><span><span class="toc-num">08</span><span class="toc-title">Data Validation</span></span></div>' : ''}
</div>

<div class="page">

  <!-- 0. EXECUTIVE SUMMARY (McKinsey-style headline + key findings) -->
  ${s.executive_summary ? `
  <h2>00 — Executive Summary</h2>
  <div class="card card-accent" style="margin-bottom:16px;">
    <div class="label">HEADLINE</div>
    <p style="font-size:18px; font-weight:600; line-height:1.4; margin-top:6px;">${esc(s.executive_summary.headline)}</p>
  </div>
  ${(s.executive_summary.key_findings || []).length > 0 ? `
  <h3>Key Findings</h3>
  <ol style="padding-left:20px; margin-bottom:16px;">
    ${s.executive_summary.key_findings.map(f => `<li style="font-size:14px; margin-bottom:8px; padding-left:6px;">${esc(f)}</li>`).join('')}
  </ol>` : ''}
  ${s.executive_summary.strategic_imperative ? `
  <div class="card card-warn" style="margin-bottom:12px;">
    <div class="label">STRATEGIC IMPERATIVE (NEXT 90 DAYS)</div>
    <p style="font-size:14px; font-weight:500; margin-top:6px;">${esc(s.executive_summary.strategic_imperative)}</p>
  </div>` : ''}
  ${s.executive_summary.risk_if_inaction ? `
  <div class="card" style="margin-bottom:16px; border-left:3px solid #EF4444;">
    <div class="label" style="color:#EF4444;">RISK IF INACTION</div>
    <p style="font-size:13px; color:#475569; margin-top:4px;">${esc(s.executive_summary.risk_if_inaction)}</p>
  </div>` : ''}
  ` : ''}

  <!-- 1. BRAND IDENTITY -->
  <h2>01 — Brand Identity</h2>
  ${(() => {
    const bi = s.brand_identity || {};
    const arch = bi.brand_archetype;
    // New schema: brand_archetype is an object with primary, secondary, evidence, etc.
    const archIsObj = arch && typeof arch === 'object';
    const consistency = bi.brand_consistency || (bi.brand_consistency_score != null
      ? { overall_score: bi.brand_consistency_score, summary_notes: bi.brand_consistency_notes }
      : null);
    const dims = consistency?.dimensions || [];
    return `
    <div class="card card-accent">
      <p style="font-size:14px; margin-bottom:14px;">${esc(bi.summary)}</p>
      <div style="display:flex; gap:18px; flex-wrap:wrap; margin:12px 0;">
        <div class="metric" style="min-width:130px;">
          <div class="metric-val">${esc(consistency?.overall_score ?? '—')}/10</div>
          <div class="metric-label">Consistency (overall)</div>
        </div>
        <div class="metric" style="min-width:170px;">
          <div class="metric-val" style="font-size:16px;">${esc(archIsObj ? arch.primary : arch)}</div>
          <div class="metric-label">Primary archetype${archIsObj && arch.secondary ? ' · 2nd: ' + esc(arch.secondary) : ''}</div>
        </div>
      </div>

      ${archIsObj && (arch.evidence?.length || arch.strategic_implications || arch.drift_warning) ? `
      <div style="margin-top:14px; padding:14px; background:rgba(124,92,255,0.04); border-radius:8px;">
        ${arch.evidence?.length ? `<div class="label">Why this archetype — evidence</div>
          <ul style="font-size:13px; color:#475569; padding-left:18px; margin: 4px 0 10px;">
            ${arch.evidence.map(e => '<li>' + esc(e) + '</li>').join('')}
          </ul>` : ''}
        ${arch.strategic_implications ? `<div class="label">Strategic implications</div>
          <p style="font-size:13px; color:#1E293B; margin: 4px 0 10px;">${esc(arch.strategic_implications)}</p>` : ''}
        ${arch.drift_warning ? `<div class="label" style="color:#EF4444;">Drift warning</div>
          <p style="font-size:13px; color:#475569; margin-top: 4px;">${esc(arch.drift_warning)}</p>` : ''}
      </div>` : ''}

      ${(bi.brand_personality_traits || []).length ? `<div style="margin-top:14px;">
        <div class="label">Personality Traits</div>
        <div>${bi.brand_personality_traits.map(t => '<span class="pill pill-accent">' + esc(t) + '</span>').join('')}</div>
      </div>` : ''}

      ${bi.visual_identity_notes ? '<div style="margin-top:12px;"><div class="label">Visual Identity</div><p style="font-size:13px; color:#475569;">' + esc(bi.visual_identity_notes) + '</p></div>' : ''}

      ${dims.length ? `<div style="margin-top:18px;">
        <div class="label">Consistency rubric — dimension scores</div>
        ${consistency.scoring_rubric ? '<p style="font-size:11px; color:#94A3B8; font-style:italic; margin: 4px 0 10px;">' + esc(consistency.scoring_rubric) + '</p>' : ''}
        <table style="font-size:13px;">
          <thead><tr><th>Dimension</th><th style="width:60px;">Score</th><th>Evidence</th><th>One fix</th></tr></thead>
          <tbody>
            ${dims.map(d => `<tr>
              <td style="font-weight:600;">${esc(d.dimension)}</td>
              <td><span class="pill pill-accent">${esc(d.score)}/10</span></td>
              <td style="color:#475569;">${esc(d.evidence)}</td>
              <td style="color:#1E293B; font-weight:500;">${esc(d.fix)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${consistency?.summary_notes ? '<div style="margin-top:12px;"><div class="label">Headline read</div><p style="font-size:13px; color:#475569;">' + esc(consistency.summary_notes) + '</p></div>' : ''}
    </div>`;
  })()}

  <!-- 2. TONE & PACING -->
  <h2>02 — Tone &amp; Pacing</h2>
  <div class="card">
    <div class="grid-2" style="margin-bottom:16px;">
      <div><div class="label">Overall Tone</div><p style="font-size:15px; font-weight:600;">${esc(s.tone_and_pacing?.overall_tone)}</p></div>
      <div><div class="label">Pacing Style</div><p style="font-size:13px; color:#475569;">${esc(s.tone_and_pacing?.pacing_style)}</p></div>
    </div>
    ${s.tone_and_pacing?.optimal_duration_range ? '<div style="margin-bottom:12px;"><div class="label">Optimal Duration</div><p style="font-size:13px; color:#475569;">' + esc(s.tone_and_pacing.optimal_duration_range) + '</p></div>' : ''}
    ${s.tone_and_pacing?.hook_style ? '<div style="margin-bottom:12px;"><div class="label">Hook Style</div><p style="font-size:13px; color:#475569;">' + esc(s.tone_and_pacing.hook_style) + '</p></div>' : ''}
    ${s.tone_and_pacing?.retention_patterns ? '<div><div class="label">Retention Patterns</div><p style="font-size:13px; color:#475569;">' + esc(s.tone_and_pacing.retention_patterns) + '</p></div>' : ''}
  </div>
  ${(s.tone_and_pacing?.tone_variations || []).length > 0 ? '<h3>Platform Tone Variations</h3><table><thead><tr><th>Platform</th><th>Tone</th><th>Notes</th></tr></thead><tbody>' + s.tone_and_pacing.tone_variations.map(v => '<tr><td>' + esc(v.platform) + '</td><td style="font-weight:600;">' + esc(v.tone) + '</td><td>' + esc(v.notes) + '</td></tr>').join('') + '</tbody></table>' : ''}

  <!-- 3. EDIT STYLE GUIDE -->
  <h2>03 — Edit Style Guide</h2>
  <div class="card">
    <div style="margin-bottom:12px;"><div class="label">Current Style</div><p style="font-size:13px; color:#475569;">${esc(s.edit_style_guide?.current_style)}</p></div>
    <div class="grid-2">
      <div><div class="label">Production Tier</div><span class="pill pill-accent">${esc(s.edit_style_guide?.production_tier)}</span></div>
      <div><div class="label">Thumbnail Strategy</div><p style="font-size:12px; color:#475569;">${esc(s.edit_style_guide?.thumbnail_strategy)}</p></div>
    </div>
    ${s.edit_style_guide?.recommended_transitions?.length ? '<div style="margin-top:12px;"><div class="label">Recommended Transitions</div>' + s.edit_style_guide.recommended_transitions.map(t => '<span class="pill pill-green">' + esc(t) + '</span>').join('') + '</div>' : ''}
    ${s.edit_style_guide?.text_overlay_usage ? '<div style="margin-top:12px;"><div class="label">Text Overlays</div><p style="font-size:12px; color:#475569;">' + esc(s.edit_style_guide.text_overlay_usage) + '</p></div>' : ''}
    ${s.edit_style_guide?.music_and_sound ? '<div style="margin-top:12px;"><div class="label">Music &amp; Sound</div><p style="font-size:12px; color:#475569;">' + esc(s.edit_style_guide.music_and_sound) + '</p></div>' : ''}
    ${s.edit_style_guide?.b_roll_recommendations ? '<div style="margin-top:12px;"><div class="label">B-Roll</div><p style="font-size:12px; color:#475569;">' + esc(s.edit_style_guide.b_roll_recommendations) + '</p></div>' : ''}
    ${s.edit_style_guide?.production_recommendations ? '<div style="margin-top:12px; padding:12px; background:#fff; border-radius:8px; border-left:3px solid ' + accent + ';"><div class="label">Production Improvements</div><p style="font-size:13px; color:#1E293B; font-weight:500; margin-top:4px;">' + esc(s.edit_style_guide.production_recommendations) + '</p></div>' : ''}
  </div>

  <!-- 4. TARGET AUDIENCE / ICP -->
  <h2>04 — Target Audience &amp; ICP</h2>
  <div class="grid-2">
    ${s.target_audience?.primary_icp ? '<div class="card card-accent"><div class="label" style="color:' + accent + ';">PRIMARY ICP</div><div style="margin-top:8px;"><div class="label">Demographic</div><p style="font-size:13px;">' + esc(s.target_audience.primary_icp.demographic) + '</p></div><div style="margin-top:8px;"><div class="label">Psychographic</div><p style="font-size:13px; color:#475569;">' + esc(s.target_audience.primary_icp.psychographic) + '</p></div>' + (s.target_audience.primary_icp.pain_points?.length ? '<div style="margin-top:8px;"><div class="label">Pain Points</div>' + s.target_audience.primary_icp.pain_points.map(p => '<div style="font-size:12px; color:#475569; padding:2px 0;">&bull; ' + esc(p) + '</div>').join('') + '</div>' : '') + '<div style="margin-top:8px;"><div class="label">Content Preferences</div><p style="font-size:12px; color:#475569;">' + esc(s.target_audience.primary_icp.content_preferences) + '</p></div></div>' : ''}
    ${s.target_audience?.secondary_icp ? '<div class="card"><div class="label">SECONDARY ICP</div><div style="margin-top:8px;"><div class="label">Demographic</div><p style="font-size:13px;">' + esc(s.target_audience.secondary_icp.demographic) + '</p></div><div style="margin-top:8px;"><div class="label">Psychographic</div><p style="font-size:13px; color:#475569;">' + esc(s.target_audience.secondary_icp.psychographic) + '</p></div>' + (s.target_audience.secondary_icp.pain_points?.length ? '<div style="margin-top:8px;"><div class="label">Pain Points</div>' + s.target_audience.secondary_icp.pain_points.map(p => '<div style="font-size:12px; color:#475569; padding:2px 0;">&bull; ' + esc(p) + '</div>').join('') + '</div>' : '') + '</div>' : ''}
  </div>
  ${s.target_audience?.audience_gap ? '<div class="card card-warn" style="margin-top:12px;"><div class="label" style="color:#EF4444;">AUDIENCE GAP</div><p style="font-size:13px;">' + esc(s.target_audience.audience_gap) + '</p></div>' : ''}

  <!-- 5. USP & CONTRARIAN ANGLES -->
  <h2>05 — USP &amp; Contrarian Angles</h2>
  <div class="card card-accent">
    <div class="label">Current USP</div>
    <p style="font-size:14px; font-weight:500;">${esc(s.usp_and_contrarian_angles?.current_usp)}</p>
  </div>

  ${(s.usp_and_contrarian_angles?.contrarian_beliefs || []).length > 0 ? '<h3>Contrarian Beliefs to Weaponise</h3>' + s.usp_and_contrarian_angles.contrarian_beliefs.map(b => '<div class="card" style="margin-bottom:12px;"><p style="font-size:14px; font-weight:600; margin-bottom:6px;">' + esc(b.belief) + '</p><p style="font-size:12px; color:#475569; margin-bottom:8px;">' + esc(b.why_it_works) + '</p><span class="pill pill-accent">' + esc(b.content_format) + '</span>' + (b.example_hook ? '<div class="hook-box">&ldquo;' + esc(b.example_hook) + '&rdquo;</div>' : '') + '</div>').join('') : ''}

  ${(s.usp_and_contrarian_angles?.trend_jacking_opportunities || []).length > 0 ? '<h3>Trend-Jacking Opportunities</h3><table><thead><tr><th>Trend</th><th>Your Twist</th><th>Format</th><th>Urgency</th></tr></thead><tbody>' + s.usp_and_contrarian_angles.trend_jacking_opportunities.map(t => '<tr><td style="font-weight:600;">' + esc(t.trend) + '</td><td>' + esc(t.twist) + '</td><td>' + esc(t.format) + '</td><td><span class="impact-' + (t.urgency || 'medium') + '">' + esc(t.urgency || 'medium') + '</span></td></tr>').join('') + '</tbody></table>' : ''}

  ${(s.usp_and_contrarian_angles?.frameworks_to_steal || []).length > 0 ? '<h3>Frameworks to Steal &amp; Adapt</h3>' + s.usp_and_contrarian_angles.frameworks_to_steal.map(f => '<div class="card" style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><span style="font-weight:600;">' + esc(f.framework) + '</span><span class="pill pill-amber">from ' + esc(f.competitor) + '</span></div><p style="font-size:12px; color:#475569; margin-top:6px;">' + esc(f.adaptation) + '</p></div>').join('') : ''}

  <!-- 6. WEAKNESS BREAKDOWN -->
  <h2>06 — Weakness Breakdown &amp; Actionables</h2>

  ${(s.weakness_breakdown?.critical_weaknesses || []).length > 0 ? '<h3 style="color:#EF4444;">Critical Weaknesses</h3>' + s.weakness_breakdown.critical_weaknesses.map(w => '<div class="card card-warn" style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span style="font-weight:600;">' + esc(w.weakness) + '</span><span class="impact-' + (w.impact || 'medium') + '">' + esc(w.impact || '') + ' impact</span></div><p style="font-size:12px; color:#475569; margin-bottom:6px;"><strong>Evidence:</strong> ' + esc(w.evidence) + '</p><p style="font-size:13px; font-weight:500; padding:8px 12px; background:#fff; border-radius:6px;">&rarr; ' + esc(w.actionable) + '</p></div>').join('') : ''}

  ${(s.weakness_breakdown?.competitive_disadvantages || []).length > 0 ? '<h3>Competitive Disadvantages</h3><table><thead><tr><th>Area</th><th>Gap</th><th>Benchmark</th><th>Catch-Up Plan</th></tr></thead><tbody>' + s.weakness_breakdown.competitive_disadvantages.map(d => '<tr><td style="font-weight:600;">' + esc(d.area) + '</td><td>' + esc(d.gap_size) + '</td><td>' + esc(d.benchmark_competitor) + '</td><td>' + esc(d.catch_up_plan) + '</td></tr>').join('') + '</tbody></table>' : ''}

  ${(s.weakness_breakdown?.quick_wins || []).length > 0 ? '<h3 style="color:#22C55E;">Quick Wins</h3>' + s.weakness_breakdown.quick_wins.map(q => '<div class="card card-success" style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between;"><span style="font-weight:600;">' + esc(q.action) + '</span><div><span class="pill pill-green">' + esc(q.effort) + ' effort</span><span class="pill pill-amber">' + esc(q.timeline) + '</span></div></div><p style="font-size:12px; color:#475569; margin-top:4px;">' + esc(q.expected_impact) + '</p></div>').join('') : ''}

  <!-- 6.5 — FORMAT PERFORMANCE -->
  ${s.format_performance_analysis ? `
  <h2>07 — Format Performance &amp; Alpha Posts</h2>
  ${s.format_performance_analysis.narrative ? `<p style="font-size:14px; color:#475569; margin-bottom:14px;">${esc(s.format_performance_analysis.narrative)}</p>` : ''}

  ${(s.format_performance_analysis.format_breakdown || []).length > 0 ? `
  <h3>Format Breakdown</h3>
  <table>
    <thead><tr><th>Format</th><th>Posts</th><th>Avg Engagement</th><th>vs Baseline</th><th>Verdict</th></tr></thead>
    <tbody>
      ${s.format_performance_analysis.format_breakdown.map(f => `<tr>
        <td><span class="pill pill-accent">${esc(f.format)}</span></td>
        <td>${esc(f.post_count)}</td>
        <td style="font-weight:600;">${esc(f.avg_engagement?.toLocaleString?.() || f.avg_engagement)}</td>
        <td style="color:${(f.vs_client_baseline || '').includes('above') || (f.vs_client_baseline || '').includes('+') ? '#22C55E' : '#EF4444'};">${esc(f.vs_client_baseline)}</td>
        <td style="font-weight:500;">${esc(f.verdict)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  ${(s.format_performance_analysis.alpha_posts || []).length > 0 ? `
  <h3 style="margin-top:18px;">Alpha Posts — repurpose candidates</h3>
  ${s.format_performance_analysis.alpha_posts.map(a => `
  <div class="card" style="margin-bottom:12px; page-break-inside:avoid;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:12px;">
      <div style="flex:1;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
          <span class="pill pill-accent">${esc(a.format)}</span>
          <span class="pill pill-green">${esc(a.engagement_score?.toLocaleString?.() || a.engagement_score)} engagement</span>
          ${a.series_potential ? `<span class="pill ${a.series_potential==='high'?'pill-green':a.series_potential==='medium'?'pill-amber':'pill-accent'}">${esc(a.series_potential)} series potential</span>` : ''}
        </div>
        ${a.url ? `<a href="${esc(a.url)}" target="_blank" style="color:#7C5CFC; font-size:11px; text-decoration:none; word-break:break-all;">${esc(a.url)}</a>` : ''}
      </div>
    </div>
    ${a.what_made_it_work ? `<div style="margin-bottom:10px;"><div class="label">What made it work</div>
      <p style="font-size:13px; color:#1E293B; margin-top:4px;">${esc(a.what_made_it_work)}</p></div>` : ''}
    ${a.repurpose_play ? `<div class="card card-accent" style="margin-top:8px; padding:12px;">
      <div class="label">REPURPOSE PLAY → ${esc(a.repurpose_play.into_format)}</div>
      <p style="font-size:13px; margin: 6px 0;">${esc(a.repurpose_play.angle)}</p>
      ${a.repurpose_play.hook ? `<div class="hook-box">"${esc(a.repurpose_play.hook)}"</div>` : ''}
    </div>` : ''}
  </div>`).join('')}` : ''}

  ${(s.format_performance_analysis.underperformers_to_kill || []).length > 0 ? `
  <h3 style="margin-top:18px; color:#EF4444;">Formats to wind down</h3>
  ${s.format_performance_analysis.underperformers_to_kill.map(u => `
  <div class="card card-warn" style="margin-bottom:8px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <span style="font-weight:600;">${esc(u.format)}</span>
      <span class="pill pill-amber">${esc(u.verdict)}</span>
    </div>
    <p style="font-size:13px; color:#475569;">${esc(u.reason)}</p>
  </div>`).join('')}` : ''}
  ` : ''}

  <!-- 6.6 — CONTENT SERIES SIGNALS -->
  ${s.content_series_signals ? `
  <h2>08 — Content Series &amp; Repurpose Signals</h2>
  ${s.content_series_signals.narrative ? `<p style="font-size:14px; color:#475569; margin-bottom:14px;">${esc(s.content_series_signals.narrative)}</p>` : ''}

  ${(s.content_series_signals.series_to_extend || []).length > 0 ? `
  <h3>Series to extend</h3>
  ${s.content_series_signals.series_to_extend.map(srs => `
  <div class="card" style="margin-bottom:14px; page-break-inside:avoid;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span style="font-weight:700; font-size:15px;">${esc(srs.series_name)}</span>
      <span class="pill pill-accent">${esc(srs.format)}</span>
    </div>
    ${(srs.evidence || []).length ? `<div style="margin-bottom:10px;"><div class="label">Evidence (past winners)</div>
      <ul style="font-size:12px; color:#475569; padding-left:18px; margin-top:4px;">
        ${srs.evidence.map(e => '<li>' + esc(e) + '</li>').join('')}
      </ul></div>` : ''}
    ${(srs.next_3_episodes || []).length ? `<div style="margin-bottom:10px;"><div class="label">Next 3 episodes</div>
      <ol style="font-size:13px; color:#1E293B; padding-left:20px; margin-top:4px;">
        ${srs.next_3_episodes.map(e => '<li style="margin-bottom:3px;">' + esc(e) + '</li>').join('')}
      </ol></div>` : ''}
    ${srs.cross_format_extension ? `<div class="card card-accent" style="margin-top:8px; padding:10px;">
      <div class="label">Cross-format extension</div>
      <p style="font-size:13px; margin-top:4px;">${esc(srs.cross_format_extension)}</p>
    </div>` : ''}
  </div>`).join('')}` : ''}

  ${(s.content_series_signals.format_translation_opportunities || []).length > 0 ? `
  <h3 style="margin-top:18px;">Format translation opportunities</h3>
  <table>
    <thead><tr><th>Alpha post</th><th>Current</th><th>Translate to</th><th>Rationale</th></tr></thead>
    <tbody>
      ${s.content_series_signals.format_translation_opportunities.map(t => `<tr>
        <td><a href="${esc(t.alpha_post_url)}" target="_blank" style="color:#7C5CFC; font-size:11px; word-break:break-all;">${esc((t.alpha_post_url || '').slice(-40))}</a></td>
        <td><span class="pill pill-accent">${esc(t.current_format)}</span></td>
        <td><span class="pill pill-green">${esc(t.translate_to)}</span></td>
        <td style="font-size:13px;">${esc(t.rationale)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
  ` : ''}

  <!-- 7. COMPETITOR BATTLECARDS -->
  ${(s.competitor_battlecards || []).length > 0 ? `
  <h2>09 — Competitor Battlecards</h2>
  <p style="font-size:13px; color:#475569; margin-bottom:16px;">One card per competitor with size gap, strengths, exploitable weaknesses, and a concrete play to beat them.</p>
  ${s.competitor_battlecards.map(b => `
  <div class="card" style="margin-bottom:16px; page-break-inside:avoid;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
      <div>
        <div style="font-size:16px; font-weight:700;">${esc(b.competitor_name)}</div>
        <p style="font-size:12px; color:#475569; margin-top:2px;">${esc(b.one_line_summary || '')}</p>
      </div>
      <span class="impact-${b.threat_level || 'medium'}">${esc(b.threat_level || 'medium')} threat</span>
    </div>
    ${b.positioning_narrative ? `<div style="margin: 0 0 10px; padding: 10px 12px; background: rgba(124,92,255,0.04); border-left: 3px solid #7C5CFC; border-radius: 4px;">
      <div class="label">POSITIONING THEME</div>
      <p style="font-size:13px; color:#1E293B; margin-top: 4px;">${esc(b.positioning_narrative)}</p>
    </div>` : ''}
    ${b.format_mix ? `<div style="margin-bottom: 10px; font-size: 12px; color: #475569;"><span class="label" style="display:inline; margin-right:6px;">FORMAT MIX:</span>${esc(b.format_mix)}</div>` : ''}
    ${b.size_comparison ? `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; padding:10px; background:#F8FAFC; border-radius:6px;">
      <div><div class="label" style="font-size:10px;">THEIR FOLLOWERS</div><div style="font-weight:700; font-size:14px;">${esc((b.size_comparison.their_followers||0).toLocaleString())}</div></div>
      <div><div class="label" style="font-size:10px;">CLIENT FOLLOWERS</div><div style="font-weight:700; font-size:14px;">${esc((b.size_comparison.client_followers||0).toLocaleString())}</div></div>
      <div><div class="label" style="font-size:10px;">GAP</div><div style="font-weight:700; font-size:14px; color:${accent};">${esc(b.size_comparison.gap_multiple || '—')}</div></div>
    </div>` : ''}
    ${(b.what_they_do_well || []).length > 0 ? `<div style="margin-bottom:8px;"><div class="label" style="color:#22C55E;">WHAT THEY DO WELL</div><ul style="padding-left:18px; font-size:12px;">${b.what_they_do_well.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>` : ''}
    ${(b.what_they_do_badly || []).length > 0 ? `<div style="margin-bottom:8px;"><div class="label" style="color:#EF4444;">EXPLOITABLE GAPS</div><ul style="padding-left:18px; font-size:12px;">${b.what_they_do_badly.map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>` : ''}
    ${(b.signature_content_moves || []).length > 0 ? `<div style="margin-bottom:8px;"><div class="label">SIGNATURE MOVES</div>${b.signature_content_moves.map(x => '<span class="pill pill-amber">' + esc(x) + '</span>').join('')}</div>` : ''}
    ${b.how_to_beat_them ? `<div class="card card-accent" style="margin-top:10px; padding:10px;"><div class="label">HOW TO BEAT THEM</div><p style="font-size:13px; font-weight:500; margin-top:4px;">${esc(b.how_to_beat_them)}</p></div>` : ''}
    ${b.steal_adapt_avoid ? `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px;">
      <div style="padding:8px; background:#F0FDF4; border-left:3px solid #22C55E; border-radius:4px;"><div class="label" style="color:#16A34A; font-size:10px;">STEAL</div><p style="font-size:12px; margin-top:4px;">${esc(b.steal_adapt_avoid.steal || '')}</p></div>
      <div style="padding:8px; background:#FEF3C7; border-left:3px solid #F59E0B; border-radius:4px;"><div class="label" style="color:#D97706; font-size:10px;">ADAPT</div><p style="font-size:12px; margin-top:4px;">${esc(b.steal_adapt_avoid.adapt || '')}</p></div>
      <div style="padding:8px; background:#FEE2E2; border-left:3px solid #EF4444; border-radius:4px;"><div class="label" style="color:#DC2626; font-size:10px;">AVOID</div><p style="font-size:12px; margin-top:4px;">${esc(b.steal_adapt_avoid.avoid || '')}</p></div>
    </div>` : ''}
  </div>`).join('')}
  ` : ''}

  <!-- 8. STRATEGIC ROADMAP -->
  ${s.strategic_roadmap ? `
  <h2>08 — Strategic Roadmap</h2>
  ${(s.strategic_roadmap.next_30_days || []).length > 0 ? `
  <h3>Next 30 Days</h3>
  <table><thead><tr><th>Priority</th><th>Action</th><th>Owner</th><th>Success Metric</th></tr></thead><tbody>
  ${s.strategic_roadmap.next_30_days.map(a => `<tr><td><span class="pill pill-accent">${esc(a.priority || 'P1')}</span></td><td style="font-weight:500;">${esc(a.action)}</td><td>${esc(a.owner)}</td><td style="color:#475569; font-size:12px;">${esc(a.success_metric)}</td></tr>`).join('')}
  </tbody></table>` : ''}
  ${(s.strategic_roadmap.next_90_days || []).length > 0 ? `
  <h3>Next 90 Days</h3>
  <table><thead><tr><th>Priority</th><th>Initiative</th><th>Owner</th><th>Target</th></tr></thead><tbody>
  ${s.strategic_roadmap.next_90_days.map(a => `<tr><td><span class="pill pill-accent">${esc(a.priority || 'P1')}</span></td><td style="font-weight:500;">${esc(a.action)}</td><td>${esc(a.owner)}</td><td style="color:#475569; font-size:12px;">${esc(a.success_metric)}</td></tr>`).join('')}
  </tbody></table>` : ''}
  ${(s.strategic_roadmap.next_12_months || []).length > 0 ? `
  <h3>12-Month Milestones</h3>
  ${s.strategic_roadmap.next_12_months.map(m => `<div class="card" style="margin-bottom:10px;"><div style="display:flex; justify-content:space-between;"><span style="font-weight:600; font-size:14px;">${esc(m.milestone)}</span><span class="pill pill-green">${esc(m.target)}</span></div>${(m.enabling_bets||[]).length > 0 ? '<div style="margin-top:8px;"><div class="label">ENABLING BETS</div>' + m.enabling_bets.map(b => '<span class="pill pill-amber">' + esc(b) + '</span>').join('') + '</div>' : ''}</div>`).join('')}` : ''}
  ` : ''}

  <!-- 9. CONTENT CALENDAR -->
  ${(s.content_calendar_seeds || []).length > 0 ? '<h2>09 — Content Calendar (4 Weeks)</h2>' + s.content_calendar_seeds.map(w => '<div class="card" style="margin-bottom:12px;"><div class="label">WEEK ' + w.week + ' &mdash; ' + esc(w.theme) + '</div><table><thead><tr><th>Day</th><th>Format</th><th>Topic</th><th>Hook</th></tr></thead><tbody>' + (w.posts || []).map(p => '<tr><td style="font-weight:600;">' + esc(p.day) + '</td><td><span class="pill pill-accent">' + esc(p.format) + '</span></td><td>' + esc(p.topic) + '</td><td style="font-style:italic; color:#475569;">' + esc(p.hook) + '</td></tr>').join('') + '</tbody></table></div>').join('') : ''}

  <!-- 8. VALIDATION (if present) -->
  ${s.validation ? buildValidationSection(s.validation) : ''}

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-brand">
      <span style="font-weight:700; color:${accent};">${esc(agencyName)}</span>
      ${agency.website ? '<span>&middot;</span><span>' + esc(agency.website) + '</span>' : ''}
    </div>
    <p>Generated ${esc(s.generated_date || '')} &middot; Confidential &middot; Do not distribute without permission</p>
  </div>
</div>

</body>
</html>`;
}

function buildValidationSection(v) {
  let html = '<h2>10 — Data Validation</h2>';
  html += '<p style="font-size:13px; color:#475569; margin-bottom:16px;">Automated cross-check of report claims against actual scraped data. This section ensures accuracy and flags any unverified assertions.</p>';

  if (v.checks && v.checks.length > 0) {
    v.checks.forEach(c => {
      const cls = c.status === 'pass' ? 'validation-pass' : c.status === 'warn' ? 'validation-warn' : 'validation-fail';
      const icon = c.status === 'pass' ? '&#10003;' : c.status === 'warn' ? '&#9888;' : '&#10007;';
      html += `<div class="validation ${cls}"><strong>${icon} ${esc(c.claim)}</strong><br/>${esc(c.detail)}</div>`;
    });
  }

  if (v.overall_confidence) {
    html += `<div class="card" style="margin-top:16px; text-align:center;"><div class="label">OVERALL CONFIDENCE</div><div class="metric-val" style="font-size:32px;">${esc(v.overall_confidence)}</div><p style="font-size:12px; color:#94A3B8; margin-top:4px;">${esc(v.summary || '')}</p></div>`;
  }

  return html;
}
