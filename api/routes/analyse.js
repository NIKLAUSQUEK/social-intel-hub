/**
 * LLM-powered post analysis routes
 */

import { Router } from 'express';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scrapeCompetitors } from '../../scraper/competitors.js';
import { callLLM } from '../lib/llm-v2.js';
import { clientIdGuard, safeError } from '../lib/security.js';
import { pushNotification } from '../../notifications/service.js';
import { analyseFormatPerformance, inferFormat, formatLabel } from '../lib/format-inference.js';
import { htmlToPdf } from '../lib/pdf.js';
import { buildReportHtml } from '../lib/report-html.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const router = Router();

// Apply clientId validation to all :id routes
router.param('id', clientIdGuard);

/**
 * Best-effort repair for truncated JSON responses (e.g. when LLM hits max_tokens mid-output).
 * Strategy: walk backwards to find last safe position where we can close open structures.
 */
function repairTruncatedJson(text) {
  if (!text || text.length < 100) return null;
  // Find the last unambiguous close token
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}' || ch === ']') {
      const candidate = text.slice(0, i + 1);
      // Count braces to see if structure is balanced
      let depth = 0, arrDepth = 0, inStr = false, esc = false;
      for (const c of candidate) {
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '[') arrDepth++;
        else if (c === ']') arrDepth--;
      }
      if (depth === 0 && arrDepth === 0 && !inStr) {
        try { JSON.parse(candidate); return candidate; }
        catch { /* keep walking */ }
      }
      // Try adding closing braces if only object depth is off
      if (!inStr && depth > 0 && arrDepth >= 0) {
        const trial = candidate + ']'.repeat(Math.max(0, arrDepth)) + '}'.repeat(depth);
        try { JSON.parse(trial); return trial; } catch { /* keep walking */ }
      }
    }
  }
  return null;
}

function readClientFile(clientId, filename) {
  const filePath = join(ROOT, 'data', clientId, filename);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[Data] Failed to parse ${clientId}/${filename}:`, err.message);
    return null;
  }
}

function saveClientFile(clientId, filename, data) {
  const dir = join(ROOT, 'data', clientId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// POST /api/analyse/:id — run LLM analysis on a client's posts
router.post('/:id', async (req, res) => {
  try {
    const clientId = req.params.id;
    const posts = readClientFile(clientId, 'posts-latest.json');
    const metrics = readClientFile(clientId, 'metrics-latest.json');
    const history = readClientFile(clientId, 'history.json');

    if (!posts) {
      return res.status(404).json({ success: false, error: 'No post data found. Run the scraper first.' });
    }

    // Build context for the LLM
    const allPosts = [];
    for (const [platform, platformPosts] of Object.entries(posts.platforms || {})) {
      for (const post of platformPosts) {
        allPosts.push({ ...post, platform });
      }
    }

    if (allPosts.length === 0) {
      return res.status(404).json({ success: false, error: 'No posts to analyse.' });
    }

    // Profile context
    const profileContext = {};
    if (metrics?.platforms) {
      for (const [p, data] of Object.entries(metrics.platforms)) {
        profileContext[p] = {
          followers: data.followers || data.pageLikes || 0,
          totalLikes: data.likes || 0,
          following: data.following || 0,
          bio: data.bio || '',
        };
      }
    }

    // Growth context
    const snapshots = history?.snapshots || [];
    const recentGrowth = snapshots.length >= 2
      ? {
          igChange: (snapshots.at(-1)?.instagram?.followers || 0) - (snapshots[0]?.instagram?.followers || 0),
          ttChange: (snapshots.at(-1)?.tiktok?.followers || 0) - (snapshots[0]?.tiktok?.followers || 0),
          period: `${snapshots[0]?.date} to ${snapshots.at(-1)?.date}`,
        }
      : null;

    // Load competitor data
    const competitors = readClientFile(clientId, 'competitors-latest.json');

    // Format posts for the prompt
    const postSummaries = allPosts.map((p, i) => {
      const eng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
      return `Post ${i + 1} [${p.platform.toUpperCase()}] (${p.postType || 'Unknown'})
  URL: ${p.url || 'N/A'}
  Caption: ${(p.caption || '').slice(0, 300)}
  Date: ${p.date || 'Unknown'}
  Likes: ${p.likes ?? '—'} | Comments: ${p.comments ?? '—'} | Shares: ${p.shares ?? '—'} | Views: ${p.views ?? '—'} | Saves: ${p.saves ?? '—'}
  Total engagement: ${eng}`;
    }).join('\n\n');

    // Format competitor data
    let competitorSection = '';
    if (competitors?.competitors?.length > 0) {
      const compSummaries = competitors.competitors.map((c) => {
        let summary = `### ${c.name} (${c.party})`;

        if (c.tiktok?.videos?.length > 0) {
          const topVids = c.tiktok.videos.slice(0, 5).map((v, i) =>
            `  ${i + 1}. Views: ${v.views} | Likes: ${v.likes} | Comments: ${v.comments} | Shares: ${v.shares} | Caption: "${(v.caption || '').slice(0, 150)}"`
          ).join('\n');
          summary += `\n**TikTok** — Avg views: ${c.tiktok.avgViews}, Avg engagement: ${c.tiktok.avgEngagement}, Videos scraped: ${c.tiktok.videos.length}\nTop videos:\n${topVids}`;
        }

        if (c.instagram) {
          summary += `\n**Instagram** — Followers: ${c.instagram.followers || '?'}, Posts: ${c.instagram.posts || '?'}, Avg engagement: ${c.instagram.avgEngagement || '?'}`;
          if (c.instagram.posts?.length > 0) {
            const topIG = c.instagram.posts.slice(0, 3).map((p, i) =>
              `  ${i + 1}. Likes: ${p.likes} | Comments: ${p.comments} | Type: ${p.postType} | Caption: "${(p.caption || '').slice(0, 100)}"`
            ).join('\n');
            summary += `\nTop posts:\n${topIG}`;
          }
        }

        return summary;
      }).join('\n\n');

      competitorSection = `
## Competitor Landscape
${compSummaries}`;
    }

    const prompt = `You are a senior social media strategist and competitive intelligence analyst. Analyse the client's social media performance against their competitors and the broader market.

## Client Profile
${JSON.stringify(profileContext, null, 2)}

## Recent Growth
${recentGrowth ? JSON.stringify(recentGrowth, null, 2) : 'Not enough historical data yet.'}

## Client's Recent Posts
${postSummaries}
${competitorSection}

## Your Analysis

Provide a comprehensive strategic analysis covering:

### PART 1: Post Performance Analysis
1. **Top Performers** — which posts got the highest engagement and WHY (content type, topic, format, caption style, timing)
2. **Underperformers** — which posts underperformed and likely reasons
3. **Content Type Comparison** — Image vs Reel vs Video performance. Which format to double down on?
4. **Caption & Hook Analysis** — what caption patterns drive engagement?
5. **Language Analysis** — if bilingual, how does language choice affect engagement?

### PART 2: Competitive Intelligence
6. **Competitor Benchmarking** — how does the client compare on key metrics (followers, engagement rate, views, posting frequency)?
7. **Content Gaps** — what topics/formats are competitors doing successfully that the client is NOT doing? What are the gaps in the market that no one is covering?
8. **Competitive Advantages** — where is the client outperforming competitors? What unique angle do they have?
9. **Share of Voice** — who dominates in this space and on which platforms?

### PART 3: Content Strategy Recommendations
10. **Content Types to Prioritise** — based on competitor data AND the client's own performance, which content formats should they focus on? (e.g., talking head, interview clips, motion graphics, behind-the-scenes, Q&A, reaction videos, explainers, carousel infographics)
11. **Topics & Themes** — what topics are driving the most engagement in the competitive set? What themes should the client lean into?
12. **Platform-Specific Strategy** — tailored recommendations per platform
13. **Posting Schedule** — optimal frequency and timing based on the data
14. **10 Actionable Recommendations** — specific, data-backed actions ranked by expected impact

Format your response in Markdown with clear headings. Be specific — reference actual post data, competitor names, and metrics. Don't be generic. Use British English.`;

    const analysis = await callLLM(prompt);

    // Cache the analysis
    const analysisData = {
      clientId,
      generatedAt: new Date().toISOString(),
      postsAnalysed: allPosts.length,
      competitorsIncluded: competitors?.competitors?.length || 0,
      platforms: [...new Set(allPosts.map(p => p.platform))],
      analysis,
    };
    saveClientFile(clientId, 'analysis-latest.json', analysisData);

    res.json({ success: true, data: analysisData });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyse/:id/competitors — scrape competitor data
router.post('/:id/competitors', async (req, res) => {
  try {
    const data = await scrapeCompetitors(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'No competitors configured for this client.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('Competitor scrape error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/competitors — get cached competitor data
router.get('/:id/competitors', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'competitors-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No competitor data yet. Click "Scrape Competitors" first.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id — get cached analysis
router.get('/:id', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'analysis-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No analysis generated yet. Click "Run Analysis" to generate one.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/wayback — fetch Wayback Machine snapshots for client profiles
router.get('/:id/wayback', async (req, res) => {
  try {
    const clientId = req.params.id;

    // Check cache first (valid for 24h)
    const cached = readClientFile(clientId, 'wayback-latest.json');
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 24 * 60 * 60 * 1000) {
      return res.json({ success: true, data: cached });
    }

    // Read client config
    const clientsPath = join(ROOT, 'clients.json');
    const clients = JSON.parse(readFileSync(clientsPath, 'utf-8'));
    const client = clients.clients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const results = {};
    const platforms = client.platforms || {};

    for (const [platform, info] of Object.entries(platforms)) {
      if (!info.url) continue;
      try {
        const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(info.url)}&output=json&limit=20&fl=timestamp,statuscode,mimetype&collapse=timestamp:8`;
        const cdxRes = await fetch(cdxUrl, { signal: AbortSignal.timeout(15000) });
        if (!cdxRes.ok) continue;
        const cdxData = await cdxRes.json();
        if (cdxData.length <= 1) continue; // header only

        const snapshots = cdxData.slice(1).map(row => ({
          timestamp: row[0],
          date: row[0].slice(0, 4) + '-' + row[0].slice(4, 6) + '-' + row[0].slice(6, 8),
          status: row[1],
          waybackUrl: `https://web.archive.org/web/${row[0]}/${info.url}`,
        }));

        results[platform] = { url: info.url, snapshots };
      } catch (err) {
        results[platform] = { url: info.url, snapshots: [], error: err.message };
      }
    }

    const waybackData = { clientId, fetchedAt: new Date().toISOString(), platforms: results };
    saveClientFile(clientId, 'wayback-latest.json', waybackData);
    res.json({ success: true, data: waybackData });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyse/:id/competitor-intel — generate competitor content analysis via LLM
router.post('/:id/competitor-intel', async (req, res) => {
  try {
    const clientId = req.params.id;
    const competitors = readClientFile(clientId, 'competitors-latest.json');
    const clientPosts = readClientFile(clientId, 'posts-latest.json');
    const clientMetrics = readClientFile(clientId, 'metrics-latest.json');

    if (!competitors?.competitors?.length) {
      return res.status(404).json({ success: false, error: 'No competitor data. Scrape competitors first.' });
    }

    // Build detailed competitor breakdown
    const compDetails = competitors.competitors.map(c => {
      let detail = `### ${c.name} (${c.party})`;
      if (c.tiktok?.videos?.length > 0) {
        detail += `\nTikTok: ${c.tiktok.totalVideos} videos scraped, avg ${c.tiktok.avgViews} views, avg ${c.tiktok.avgEngagement} engagement`;
        detail += `\nTop 5 TikTok videos:`;
        c.tiktok.videos.slice(0, 5).forEach((v, i) => {
          detail += `\n  ${i+1}. Views: ${v.views} | Likes: ${v.likes} | Comments: ${v.comments} | Shares: ${v.shares} | Saves: ${v.saves || 0} | Duration: ${v.duration}s | Date: ${v.date}`;
          if (v.caption) detail += `\n     Caption: "${v.caption.slice(0, 250)}"`;
        });
      }
      if (c.instagram?.followers) {
        detail += `\nInstagram: ${c.instagram.followers} followers`;
      }
      return detail;
    }).join('\n\n');

    // Client's own stats
    const clientStats = {};
    if (clientPosts?.platforms) {
      for (const [p, pPosts] of Object.entries(clientPosts.platforms)) {
        const views = pPosts.reduce((s, x) => s + (x.views || 0), 0);
        const eng = pPosts.reduce((s, x) => s + (x.likes || 0) + (x.comments || 0) + (x.shares || 0), 0);
        clientStats[p] = { posts: pPosts.length, avgViews: Math.round(views / (pPosts.length || 1)), avgEng: Math.round(eng / (pPosts.length || 1)) };
      }
    }

    const prompt = `You are a McKinsey-level social media competitive intelligence analyst. Return ONLY valid JSON (no markdown, no explanation, no code fences). British English.

## Client's Own Performance
${JSON.stringify(clientStats, null, 2)}
Client followers: IG ${clientMetrics?.platforms?.instagram?.followers || 0}, TT ${clientMetrics?.platforms?.tiktok?.followers || 0}, FB ${clientMetrics?.platforms?.facebook?.pageLikes || 0}

## Competitor Data
${compDetails}

Return this exact JSON structure:
{
  "executive_summary": "2-3 sentence brutally honest assessment of client's competitive position",
  "client_position": {
    "rank": <number out of total tracked>,
    "total_tracked": <number>,
    "verdict": "one-line verdict e.g. Mid-table with upside"
  },
  "competitors": [
    {
      "name": "Competitor Name",
      "tier": "dominant|strong|average|weak",
      "avg_views": <number>,
      "avg_engagement": <number>,
      "views_vs_client": <multiplier e.g. 2.9>,
      "key_strengths": ["strength 1", "strength 2", "strength 3"],
      "key_weaknesses": ["weakness 1"],
      "what_client_can_steal": ["actionable takeaway 1", "actionable takeaway 2"],
      "winning_formula": "One sentence describing their core strategy"
    }
  ],
  "format_rankings": [
    { "format": "Format name", "effectiveness": <1-100>, "best_used_by": ["Name1", "Name2"], "why": "One sentence" }
  ],
  "topic_rankings": [
    { "topic": "Topic name", "virality_score": <1-100>, "why": "One sentence" }
  ],
  "gap_analysis": {
    "missing_formats": ["format 1", "format 2"],
    "missing_topics": ["topic 1", "topic 2"],
    "strategic_recommendation": "2-3 sentence core recommendation"
  },
  "spotlight_analyses": [
    {
      "name": "Name of standout competitor",
      "avg_views": <number>,
      "multiplier_vs_client": <number>,
      "formula_title": "e.g. The Outrage Engine",
      "formula_points": ["point 1", "point 2", "point 3"],
      "what_to_copy": "One sentence — not the tone, but the mechanics"
    }
  ]
}

Be brutally honest. Use real numbers from the data. Every competitor in the data must appear in the competitors array.`;

    const rawAnalysis = await callLLM(prompt);

    // Parse structured JSON; fall back to raw text if parsing fails
    let structured = null;
    try {
      const cleaned = rawAnalysis.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      structured = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log('  [INTEL] JSON parse failed, storing raw text:', parseErr.message);
    }

    const intelData = {
      clientId,
      generatedAt: new Date().toISOString(),
      competitorsAnalysed: competitors.competitors.length,
      analysis: structured ? null : rawAnalysis,
      structured,
    };
    saveClientFile(clientId, 'competitor-intel-latest.json', intelData);
    res.json({ success: true, data: intelData });
  } catch (err) {
    console.error('Competitor intel error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/competitor-intel — get cached competitor intelligence
router.get('/:id/competitor-intel', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'competitor-intel-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No competitor intelligence yet.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/analyse/:id/brand-report — generate comprehensive brand strategy report
router.post('/:id/brand-report', async (req, res) => {
  try {
    const clientId = req.params.id;
    const competitors = readClientFile(clientId, 'competitors-latest.json');
    const clientPosts = readClientFile(clientId, 'posts-latest.json');
    const clientMetrics = readClientFile(clientId, 'metrics-latest.json');
    const trends = readClientFile(clientId, 'trends-latest.json');
    const competitorIntel = readClientFile(clientId, 'competitor-intel-latest.json');
    const classifications = readClientFile(clientId, 'classifications.json');
    const postTracker = readClientFile(clientId, 'post-tracker.json');
    const tasks = readClientFile(clientId, 'tasks.json');
    const history = readClientFile(clientId, 'history.json');
    const alerts = readClientFile(clientId, 'alerts-latest.json');

    // Read client config for name
    const clientsPath = join(ROOT, 'clients.json');
    let clientName = clientId;
    try {
      const clients = JSON.parse(readFileSync(clientsPath, 'utf-8'));
      const client = clients.clients.find(c => c.id === clientId);
      if (client) clientName = client.name;
    } catch {}

    if (!clientPosts && !competitors?.competitors?.length) {
      return res.status(404).json({ success: false, error: 'No data available. Run scraper and competitor scrape first.' });
    }

    // Build post context — ALL posts (not just 20) for full month analysis
    const allPosts = [];
    if (clientPosts?.platforms) {
      for (const [platform, platformPosts] of Object.entries(clientPosts.platforms)) {
        for (const post of platformPosts) {
          allPosts.push({ ...post, platform });
        }
      }
    }
    // Sort by engagement descending and include up to 40 posts for richer analysis
    allPosts.sort((a, b) => {
      const engA = (a.likes || 0) + (a.comments || 0) + (a.shares || 0);
      const engB = (b.likes || 0) + (b.comments || 0) + (b.shares || 0);
      return engB - engA;
    });
    // Enrich every post with an inferred format (ig-reel / ig-carousel / ig-static / tt-video / ... )
    // so downstream analysis can surface alphas and series candidates.
    for (const p of allPosts) {
      p.inferredFormat = inferFormat(p);
      p.inferredFormatLabel = formatLabel(p.inferredFormat);
    }

    const postSummaries = allPosts.slice(0, 40).map((p, i) => {
      const eng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
      return `Post ${i + 1} [${p.platform.toUpperCase()}] (${p.inferredFormatLabel})
  URL: ${p.url || ''}
  Caption: ${(p.caption || '').slice(0, 300)}
  Date: ${p.date || 'Unknown'}
  Likes: ${p.likes ?? '—'} | Comments: ${p.comments ?? '—'} | Shares: ${p.shares ?? '—'} | Views: ${p.views ?? '—'} | Duration: ${p.duration ?? '—'}s
  Total engagement: ${eng}`;
    }).join('\n\n');

    // Format-aware performance breakdown (alphas + series signals by format)
    const classificationList = (classifications && typeof classifications === 'object')
      ? Object.values(classifications)
      : [];
    const formatAnalysis = analyseFormatPerformance(allPosts, classificationList);
    const formatBreakdownContext = `
## Format-Aware Performance Breakdown (${formatAnalysis.totalPosts} posts across ${formatAnalysis.formatsCount} format(s))
${Object.entries(formatAnalysis.byFormat).map(([fmt, g]) => `- ${g.label}: ${g.count} posts · avg ${g.avgViews} views · avg ${g.avgLikes} likes · avg ${g.avgComments} comments · avg engagement ${g.avgEngagement}
  Top 3:
${g.top3.map((t, i) => `    ${i+1}. [${t.views}v/${t.likes}l/${t.comments}c] "${(t.caption||'').slice(0,120)}"`).join('\n')}`).join('\n')}

## Alpha Posts (weighted engagement × recency, top ${formatAnalysis.alphas.length})
${formatAnalysis.alphas.map((a, i) => `${i+1}. [${a.formatLabel}] ${a.engagement.toLocaleString()} weighted engagement · hook: ${a.hookType || '—'} · type: ${a.contentType || '—'}
   URL: ${a.url}
   Caption: "${(a.caption || '').slice(0,160)}"`).join('\n')}

## Detected Series Candidates (same format × same signal, ≥2 posts)
${formatAnalysis.series.length > 0 ? formatAnalysis.series.slice(0, 8).map((s, i) => `${i+1}. ${s.formatLabel} × ${s.signal} — ${s.postCount} posts, avg engagement ${s.avgEngagement}`).join('\n') : '(none — need more classified posts)'}
`;

    // Build competitor context — include MORE competitor videos for pattern analysis
    const compDetails = (competitors?.competitors || []).map(c => {
      let detail = `### ${c.name}`;
      if (c.tiktok?.videos?.length > 0) {
        detail += `\nTikTok: ${c.tiktok.totalVideos} videos, avg ${c.tiktok.avgViews} views, avg ${c.tiktok.avgEngagement} engagement`;
        detail += `\nTop 8 TikTok videos:`;
        c.tiktok.videos.slice(0, 8).forEach((v, i) => {
          detail += `\n  ${i+1}. Views: ${v.views} | Likes: ${v.likes} | Comments: ${v.comments} | Shares: ${v.shares} | Duration: ${v.duration}s | Date: ${v.date || '?'}`;
          if (v.caption) detail += `\n     Caption: "${v.caption.slice(0, 300)}"`;
        });
      }
      if (c.instagram?.followers) {
        detail += `\nInstagram: ${c.instagram.followers} followers`;
        if (c.instagram?.posts?.length > 0) {
          detail += `\nTop IG posts:`;
          c.instagram.posts.slice(0, 3).forEach((p, i) => {
            detail += `\n  ${i+1}. Likes: ${p.likes} | Comments: ${p.comments} | Type: ${p.postType || '?'} | Caption: "${(p.caption || '').slice(0, 150)}"`;
          });
        }
      }
      return detail;
    }).join('\n\n');

    // Client profile stats
    const clientStats = {};
    if (clientMetrics?.platforms) {
      for (const [p, data] of Object.entries(clientMetrics.platforms)) {
        clientStats[p] = {
          followers: data.followers || data.pageLikes || 0,
          totalLikes: data.likes || 0,
          bio: data.bio || '',
        };
      }
    }

    // Post performance evolution — which posts are growing/declining
    let postEvolutionContext = '';
    if (postTracker && typeof postTracker === 'object') {
      const trackedPosts = Object.entries(postTracker).slice(0, 15);
      if (trackedPosts.length > 0) {
        const summaries = trackedPosts.map(([id, data]) => {
          const snaps = data.snapshots || [];
          if (snaps.length < 2) return null;
          const first = snaps[0];
          const last = snaps[snaps.length - 1];
          const viewGrowth = (last.views || 0) - (first.views || 0);
          const engGrowth = ((last.likes || 0) + (last.comments || 0)) - ((first.likes || 0) + (first.comments || 0));
          return `- "${(data.caption || '').slice(0, 100)}" [${data.platform}]: views ${first.views || 0}→${last.views || 0} (+${viewGrowth}), eng +${engGrowth} over ${snaps.length} snapshots`;
        }).filter(Boolean);
        if (summaries.length > 0) {
          postEvolutionContext = `\n## Post Performance Evolution (tracked over time)\n${summaries.join('\n')}`;
        }
      }
    }

    // Content classifications — what types/hooks/sentiments perform best
    let classificationContext = '';
    if (classifications && typeof classifications === 'object') {
      const classified = Object.values(classifications).slice(0, 20);
      if (classified.length > 0) {
        const types = {};
        classified.forEach(c => {
          const t = c.content_type || 'unknown';
          if (!types[t]) types[t] = { count: 0, avgSentiment: 0, hooks: [] };
          types[t].count++;
          types[t].avgSentiment += (c.sentiment_score || 0);
          if (c.hook_type) types[t].hooks.push(c.hook_type);
        });
        const typeSummary = Object.entries(types).map(([t, d]) => `- ${t}: ${d.count} posts, avg sentiment ${Math.round(d.avgSentiment / d.count)}/100, hooks: ${[...new Set(d.hooks)].join(', ')}`);
        classificationContext = `\n## Content Classification Analysis\n${typeSummary.join('\n')}`;
      }
    }

    // Strategy & goals context
    let strategyContext = '';
    if (tasks) {
      const parts = [];
      if (tasks.goals?.length) parts.push('Goals: ' + tasks.goals.map(g => g.text).join(', '));
      if (tasks.strategy?.length) parts.push('Strategy: ' + tasks.strategy.map(s => s.text).join(', '));
      if (tasks.filmingStyle?.length) parts.push('Filming style: ' + tasks.filmingStyle.map(f => f.text).join(', '));
      if (tasks.actionables?.length) parts.push('Action items: ' + tasks.actionables.filter(a => a.status !== 'done').map(a => `${a.text} (${a.status})`).join(', '));
      if (parts.length > 0) strategyContext = `\n## Current Strategy & Goals\n${parts.join('\n')}`;
    }

    // Growth trajectory
    let growthContext = '';
    const snapshots = history?.snapshots || history?.scrapeHistory || [];
    if (snapshots.length >= 2) {
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];
      const period = `${first.date || '?'} to ${last.date || '?'}`;
      const igGrowth = (last.instagram?.followers || 0) - (first.instagram?.followers || 0);
      const ttGrowth = (last.tiktok?.followers || 0) - (first.tiktok?.followers || 0);
      const fbGrowth = ((last.facebook?.pageLikes || last.facebook?.followers || 0) - (first.facebook?.pageLikes || first.facebook?.followers || 0));
      growthContext = `\n## Growth Trajectory (${period}, ${snapshots.length} data points)\nIG: ${igGrowth > 0 ? '+' : ''}${igGrowth} followers\nTT: ${ttGrowth > 0 ? '+' : ''}${ttGrowth} followers\nFB: ${fbGrowth > 0 ? '+' : ''}${fbGrowth} likes/followers`;
    }

    // Trend context from Exa
    let trendContext = '';
    if (trends?.trends?.length > 0) {
      trendContext = `\n## Trending Topics (from web research)\n${trends.trends.map(t => `- ${t.topic}: ${t.description} (${t.platform || 'web'}, viral potential: ${t.viralPotential || 'unknown'})`).join('\n')}`;
    }

    // Active alerts
    let alertContext = '';
    if (alerts?.alerts?.length > 0) {
      alertContext = `\n## Active Alerts\n${alerts.alerts.slice(0, 10).map(a => `- [${a.severity || 'info'}] ${a.title}: ${a.description || ''}`).join('\n')}`;
    }

    // Existing intel summary
    let existingIntel = '';
    if (competitorIntel?.structured) {
      const s = competitorIntel.structured;
      existingIntel = `\n## Previous Competitive Intelligence Summary\nExecutive summary: ${s.executive_summary || ''}\nGap analysis: ${s.gap_analysis?.strategic_recommendation || ''}`;
      if (s.competitors?.length) {
        existingIntel += `\nCompetitor weaknesses:\n${s.competitors.map(c => `- ${c.name}: weaknesses: ${(c.key_weaknesses || []).join(', ')} | winning formula: ${c.winning_formula || ''}`).join('\n')}`;
      }
    }

    const prompt = `You are a world-class brand strategist (think McKinsey × Edelman × a14z) producing a £25,000 brand strategy report for a paying client. Your output is what they show their board. Return ONLY valid JSON (no markdown, no code fences). British English.

═══════════════════════════════════════════════════════════
INSIGHT QUALITY BAR — every section must clear ALL of these
═══════════════════════════════════════════════════════════

1. **Cite specific evidence**, not generic platitudes.
   ✗ "Engagement has been declining"
   ✓ "Engagement on Reels dropped 34% over the last 4 weeks (avg likes 580 → 384), driven by a shift from policy-reaction format to talking-head opinion pieces"

2. **Quantify everything you can.** Pull real numbers from the data provided. Reference post URLs, follower counts, engagement deltas, competitor gaps. If you can't quantify a claim, REWRITE it until you can.

3. **Connect the dots across data sources.** A strong insight links 2-3 signals into one finding (e.g. "competitor X is gaining + audience asking Y + client's last attempt at Y outperformed by 3x → next 90 days = double down on Y").

4. **Surface non-obvious patterns.** Anything a junior analyst would have spotted is not insight, it's table stakes. Find the underlying mechanism, the contrarian read, the second-order consequence.

5. **Prescribe, don't describe.** Every weakness must come with a specific 3-step fix. Every strength must come with a specific way to weaponise it further.

6. **British English. Conversational but precise.** No "leverage", "synergies", "moving forward", "circle back". No marketing-speak. Plain Bloomberg-terminal English with sharp verbs.

7. **Density beats length.** Short paragraphs that pack 2-3 insights beat long ones that pack 0.5. If a sentence doesn't carry weight, delete it.

═══════════════════════════════════════════════════════════
COMMON FAILURE MODES TO AVOID
═══════════════════════════════════════════════════════════

- "Brand archetype: Sage" with no explanation of why or what changes
- "Increase posting frequency" — not actionable without a specific number, format, and topic
- "Engage more with the audience" — what specifically, on which posts, with which response style
- Battlecards that list competitor strengths in vague terms ("strong content") instead of mechanics ("3-second hook structure: shocking statistic → personal anecdote → contrarian claim")
- Roadmaps with action items that could apply to literally any creator
- Recommendations the client could have generated without you

═══════════════════════════════════════════════════════════
THINK LIKE THIS
═══════════════════════════════════════════════════════════

Before you write anything, mentally:
  • Identify the 3 most surprising facts in the data
  • Identify the 1 weakness that explains 60% of the underperformance
  • Identify the 1 opportunity that, if pursued, would change the trajectory
  • THEN write the report so every section serves these findings

═══════════════════════════════════════════════════════════
DATA YOU HAVE — use ALL of it, cross-reference relentlessly
═══════════════════════════════════════════════════════════
Full month of content data, engagement tracking over time, content classifications, competitor video analysis, trend research, and growth metrics.

## Client: ${clientName}
## Client Profile & Metrics
${JSON.stringify(clientStats, null, 2)}
${growthContext}
${strategyContext}

## Client's Content Library (${allPosts.length} posts, sorted by engagement)
${postSummaries}
${postEvolutionContext}
${classificationContext}
${formatBreakdownContext}

## Competitor Data
${compDetails}
${trendContext}
${alertContext}
${existingIntel}

Produce a comprehensive McKinsey-calibre Brand Strategy Report with the following JSON structure. Use the McKinsey "pyramid" style — lead with the headline insight, then supporting evidence with real numbers. Be specific, reference real data, and make it actionable:

{
  "report_title": "Brand Strategy Report — ${clientName}",
  "generated_date": "${new Date().toISOString().slice(0, 10)}",

  "executive_summary": {
    "headline": "One-sentence verdict on the client's current brand position (e.g. 'Undercapitalised brand with latent authority in property coaching — 18-month path to category leadership if positioning sharpens.')",
    "key_findings": [
      "Finding 1 — with a specific data point",
      "Finding 2 — with a specific data point",
      "Finding 3 — with a specific data point",
      "Finding 4 — with a specific data point",
      "Finding 5 — with a specific data point"
    ],
    "strategic_imperative": "The single most important thing this client must do in the next 90 days to change their trajectory",
    "risk_if_inaction": "What happens if they don't act — competitive, commercial, or reputational consequences"
  },

  "brand_identity": {
    "summary": "2-3 sentence assessment of the client's current brand identity based on their content, bio, and online presence",

    "brand_archetype": {
      "primary": "The single archetype that best fits (Creator, Hero, Sage, Explorer, Outlaw, Magician, Caregiver, Ruler, Lover, Jester, Innocent, Everyman)",
      "secondary": "Closest second-fit archetype (gives texture to the primary)",
      "evidence": [
        "Specific post / quote / observation that proves the primary archetype",
        "Second piece of evidence",
        "Third piece of evidence"
      ],
      "strategic_implications": "What this archetype demands from content going forward (formats, hook styles, themes that align)",
      "drift_warning": "Where current content drifts away from the archetype and dilutes the brand"
    },

    "brand_personality_traits": ["trait 1", "trait 2", "trait 3", "trait 4", "trait 5"],

    "visual_identity_notes": "Observations about visual style, colour palette, thumbnail style, production quality from their content",

    "brand_consistency": {
      "overall_score": <1-10>,
      "scoring_rubric": "Brief explanation of what a 7 vs 9 means here — be honest",
      "dimensions": [
        {
          "dimension": "Visual consistency (thumbnails, colour, framing)",
          "score": <1-10>,
          "evidence": "Specific examples that drove this score",
          "fix": "One concrete change to lift this dimension"
        },
        {
          "dimension": "Verbal consistency (vocabulary, slogans, recurring phrases)",
          "score": <1-10>,
          "evidence": "Specific examples",
          "fix": "Concrete fix"
        },
        {
          "dimension": "Tonal consistency (emotional register across posts)",
          "score": <1-10>,
          "evidence": "Specific examples",
          "fix": "Concrete fix"
        },
        {
          "dimension": "Value-prop consistency (does every post reinforce the same promise?)",
          "score": <1-10>,
          "evidence": "Specific examples",
          "fix": "Concrete fix"
        },
        {
          "dimension": "Cadence consistency (posting rhythm, day/time, frequency)",
          "score": <1-10>,
          "evidence": "Specific examples",
          "fix": "Concrete fix"
        }
      ],
      "summary_notes": "What's consistent and what's inconsistent overall — the headline read"
    }
  },

  "tone_and_pacing": {
    "overall_tone": "Primary tone descriptor (e.g. authoritative, casual, energetic, educational)",
    "tone_variations": [
      { "platform": "Platform name", "tone": "Platform-specific tone", "notes": "How tone differs on this platform" }
    ],
    "pacing_style": "Description of typical video pacing — fast cuts, slow builds, talking head, etc.",
    "avg_video_duration_seconds": <number or null>,
    "optimal_duration_range": "Recommended duration range based on best-performing content",
    "hook_style": "How they typically open videos — first 3 seconds pattern",
    "retention_patterns": "What keeps viewers watching based on content analysis"
  },

  "edit_style_guide": {
    "current_style": "Description of current editing approach based on content analysis",
    "recommended_transitions": ["transition type 1", "transition type 2"],
    "text_overlay_usage": "How and when to use text overlays",
    "music_and_sound": "Guidance on music, sound effects, and audio based on niche trends",
    "thumbnail_strategy": "What thumbnail style works based on competitor analysis",
    "b_roll_recommendations": "Suggestions for B-roll and supplementary footage",
    "production_tier": "Low / Mid / High — current production level",
    "production_recommendations": "Specific improvements to editing and production quality"
  },

  "target_audience": {
    "primary_icp": {
      "demographic": "Age, gender, location",
      "psychographic": "Interests, values, lifestyle",
      "pain_points": ["pain point 1", "pain point 2", "pain point 3"],
      "content_preferences": "What type of content they engage with most"
    },
    "secondary_icp": {
      "demographic": "Age, gender, location",
      "psychographic": "Interests, values, lifestyle",
      "pain_points": ["pain point 1", "pain point 2"],
      "content_preferences": "Content preferences for secondary audience"
    },
    "audience_gap": "Audience segments competitors reach that the client doesn't"
  },

  "usp_and_contrarian_angles": {
    "current_usp": "What currently differentiates the client (or lack thereof)",
    "contrarian_beliefs": [
      {
        "belief": "A contrarian belief or hot take that challenges mainstream thinking in this niche",
        "why_it_works": "Why this angle would resonate and cut through the noise",
        "content_format": "Best format to deliver this (Reel, carousel, talking head, etc.)",
        "example_hook": "Opening hook for a piece of content using this angle"
      }
    ],
    "trend_jacking_opportunities": [
      {
        "trend": "Current trend from competitor data or web research",
        "twist": "How to put a unique spin on it instead of copying",
        "format": "Content format",
        "urgency": "high / medium / low — how time-sensitive this trend is"
      }
    ],
    "frameworks_to_steal": [
      {
        "competitor": "Competitor name",
        "framework": "The content framework or format they use (e.g. 'myth-busting', 'day in the life', 'reaction')",
        "adaptation": "How the client should adapt this — NOT copy, but make it their own"
      }
    ]
  },

  "weakness_breakdown": {
    "critical_weaknesses": [
      {
        "weakness": "Description of the weakness",
        "evidence": "Data-backed evidence from scraping",
        "impact": "high / medium / low",
        "actionable": "Specific action to fix this"
      }
    ],
    "competitive_disadvantages": [
      {
        "area": "Area where client lags behind",
        "gap_size": "How far behind (with numbers)",
        "benchmark_competitor": "Who to benchmark against",
        "catch_up_plan": "Concrete steps to close the gap"
      }
    ],
    "quick_wins": [
      {
        "action": "Quick win action",
        "expected_impact": "What improvement to expect",
        "effort": "low / medium",
        "timeline": "How long to implement"
      }
    ]
  },

  "format_performance_analysis": {
    "narrative": "1-2 sentence read on which formats are over- and under-performing for this client RELATIVE to their own baseline (not industry averages — their averages).",
    "format_breakdown": [
      {
        "format": "ig-reel | ig-static | ig-carousel | ig-story | ig-igtv | tt-video | tt-photo-carousel | li-post | li-carousel | li-video | fb-reel | fb-photo etc.",
        "post_count": <int>,
        "avg_engagement": <int>,
        "vs_client_baseline": "X% above/below their own average across all formats",
        "verdict": "Lean in / hold steady / wind down — with one-sentence rationale"
      }
    ],
    "alpha_posts": [
      {
        "url": "Exact post URL from the data",
        "format": "ig-reel etc.",
        "engagement_score": <weighted engagement number>,
        "what_made_it_work": "Specific signal — topic / hook / production / timing — that drove this post above the others. Be concrete, reference numbers.",
        "repurpose_play": {
          "into_format": "ig-carousel | li-post | tt-video | etc. — different format to spin this idea into",
          "angle": "How to re-frame the same idea for the new format (NOT just paste, re-author it)",
          "hook": "Actual opening line for the repurposed version"
        },
        "series_potential": "high | medium | low — and a one-sentence reason"
      }
    ],
    "underperformers_to_kill": [
      {
        "format": "Format that consistently under-delivers for this client",
        "reason": "Why it's not working — content fit / production / saturation",
        "verdict": "Pause / rework / replace with X format"
      }
    ]
  },

  "content_series_signals": {
    "narrative": "What recurring patterns in the alpha posts suggest series-able franchises",
    "series_to_extend": [
      {
        "series_name": "Name the pattern (e.g. 'Episode-numbered policy reactions', 'Week-by-week property-deal breakdown')",
        "format": "Primary format",
        "evidence": [
          "Past post 1 (caption snippet + engagement)",
          "Past post 2 (caption snippet + engagement)",
          "Past post 3 (caption snippet + engagement)"
        ],
        "next_3_episodes": [
          "Concrete topic for episode 1",
          "Concrete topic for episode 2",
          "Concrete topic for episode 3"
        ],
        "cross_format_extension": "How to expand this series into a second format (e.g. 'compile every 4 reels into a LinkedIn carousel summary')"
      }
    ],
    "format_translation_opportunities": [
      {
        "alpha_post_url": "URL of the past winner",
        "current_format": "ig-reel etc.",
        "translate_to": "ig-carousel etc.",
        "rationale": "Why this works as a different format — what's the second-life angle"
      }
    ]
  },

  "competitor_battlecards": [
    {
      "competitor_name": "Name of competitor from client's competitor list",
      "one_line_summary": "Their positioning in one sentence",
      "positioning_narrative": "2-3 sentence overall theme — what is this competitor really about, what's their content thesis, what archetype do they embody?",
      "size_comparison": {
        "their_followers": <number from data>,
        "client_followers": <number from data>,
        "gap_multiple": "How many times bigger/smaller (e.g. '4.2x larger')"
      },
      "format_mix": "Their dominant content formats and split (e.g. '70% short-form video, 20% carousel, 10% static')",
      "what_they_do_well": [
        "Specific strength 1 — with evidence from content analysis",
        "Specific strength 2 — with evidence",
        "Specific strength 3 — with evidence"
      ],
      "what_they_do_badly": [
        "Weakness 1 — where client can win",
        "Weakness 2 — exploitable gap"
      ],
      "signature_content_moves": [
        "Format or hook pattern they repeatedly use — be specific"
      ],
      "threat_level": "high | medium | low",
      "how_to_beat_them": "Concrete positioning play to outflank this competitor, not copy them. Reference client's unique strengths.",
      "steal_adapt_avoid": {
        "steal": "One specific tactic the client SHOULD adopt",
        "adapt": "One tactic to take but twist for client's voice",
        "avoid": "One thing NOT to copy because it won't work for client"
      }
    }
  ],

  "strategic_roadmap": {
    "next_30_days": [
      { "priority": "P0 | P1 | P2", "action": "Specific tactical action", "owner": "Content / Strategy / Production", "success_metric": "How to measure it" }
    ],
    "next_90_days": [
      { "priority": "P0 | P1 | P2", "action": "Strategic initiative", "owner": "Who leads", "success_metric": "Numeric target" }
    ],
    "next_12_months": [
      { "milestone": "Major milestone", "target": "Specific numeric target", "enabling_bets": ["bet 1", "bet 2"] }
    ]
  },

  "content_calendar_seeds": [
    {
      "week": 1,
      "theme": "Weekly theme — describe the strategic theme",
      "posts": [
        { "day": "Mon", "format": "Reel", "topic": "Topic", "hook": "Opening hook — write the actual first line" },
        { "day": "Wed", "format": "Carousel", "topic": "Topic", "hook": "Opening hook" },
        { "day": "Fri", "format": "TikTok", "topic": "Topic", "hook": "Opening hook" }
      ]
    },
    { "week": 2, "theme": "...", "posts": [ "...same structure..." ] },
    { "week": 3, "theme": "...", "posts": [ "...same structure..." ] },
    { "week": 4, "theme": "...", "posts": [ "...same structure..." ] }
  ]
}

For competitor_battlecards: produce ONE battlecard for EACH competitor in the client's competitor list (up to 5). If there are no competitors, return an empty array. Each battlecard must use real numbers from the scraped data. Do NOT fabricate competitor names.

For strategic_roadmap: 30-day section should have 3-5 items, 90-day should have 3-4 items, 12-month should have 2-3 milestones.

Provide EXACTLY 4 weeks with 3 posts each (Mon/Wed/Fri) in content_calendar_seeds. Each week must have a different strategic theme. Hooks must be specific opening lines, not generic descriptions.

IMPORTANT: Be brutally honest. Use real numbers from the data. Don't be generic — reference specific posts, competitors, and metrics. Every recommendation must be actionable and specific to this client. Return ONLY valid JSON.`;

    console.log(`  [Brand Report] Generating for ${clientId}...`);
    // Sonnet 4 confirmed sufficient — user feedback Apr 19. Set BRAND_REPORT_MODEL
    // to claude-opus-4-20250514 for flagship clients if you want premium depth.
    const brandModel = process.env.BRAND_REPORT_MODEL || 'claude-sonnet-4-20250514';

    // Notify: generation started (so user gets a ping they can leave the tab)
    const reportStartTs = Date.now();
    pushNotification(clientId, {
      type: 'brand_report_started',
      title: `Brand report started — ${clientName}`,
      body: `Generating now. Typically takes 2-3 minutes.`,
      priority: 'info',
      link: `/#brand/${clientId}`,
      meta: {},
    });

    const rawResponse = await callLLM(prompt, 'brand-report', {
      maxTokens: 16000,
      tier: 'premium',
      model: brandModel,
    });

    // Parse structured JSON — with repair for truncated responses
    let structured = null;
    const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      structured = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log('  [Brand Report] JSON parse failed:', parseErr.message, '— attempting repair');
      // Repair attempt 1: cut to last balanced } / ]
      const repaired = repairTruncatedJson(cleaned);
      if (repaired) {
        try {
          structured = JSON.parse(repaired);
          console.log('  [Brand Report] ✓ Repaired truncated JSON');
        } catch (repairErr) {
          console.log('  [Brand Report] Repair also failed:', repairErr.message);
        }
      }
    }

    // ── Depth pass: detect shallow sections + force insight enrichment ──
    // Toggleable via DEPTH_PASS=off (default on). Uses Sonnet to keep Opus credit usage down.
    if (structured && (process.env.DEPTH_PASS || 'on') !== 'off') {
      try {
        console.log('  [Brand Report] Running depth pass — strengthening shallow sections...');
        const competitorList = (competitors?.competitors || []).map(c => c.name).join(', ') || 'none';
        const topCaptions    = allPosts.slice(0, 5).map(p => (p.caption || '').slice(0, 80)).join(' | ');

        const depthFilledPrompt =
`You are reviewing a brand strategy report draft for INSIGHT DEPTH. Your job is to STRENGTHEN it, not summarise it.

For EACH section below, identify if any field is:
- Generic (could apply to any creator)
- Vague (no numbers, no specific posts, no named competitors)
- Tactical without strategic logic ("post more reels" without explaining why or what type)
- Missing the contrarian/non-obvious angle

If a section is shallow, REWRITE it with deeper reasoning. Pull specific evidence from the data below. Connect 2-3 signals into one insight. Prescribe specific actions with numbers.

If a section is already strong, leave it alone.

REWRITE QUALITY BAR:
- Every weakness names the specific cause + a 3-step fix with numeric targets
- Every contrarian belief has a real-world example + measurable test
- Every battlecard has a SPECIFIC mechanic to steal (not "good content" but "their hook formula is X then Y then Z")
- Every roadmap item has a P0/P1/P2 priority + owner + measurable success metric

ORIGINAL DRAFT:
${JSON.stringify(structured, null, 2).slice(0, 12000)}

DATA CONTEXT:
Client: ${clientName}
Post count: ${allPosts.length}
Competitors: ${competitorList}
Top performer captions: ${topCaptions}

Return the FULL report JSON with shallow sections rewritten and strong sections left untouched. Use the EXACT same schema as the original. Do not add or remove top-level keys. No prose outside JSON, no markdown fences.`;

        // Depth pass uses Sonnet by default (cheaper than Opus, same depth-class for re-writes)
        // Set DEPTH_MODEL=claude-opus-4-20250514 to upgrade — costs 5x more.
        const depthRaw = await callLLM(depthFilledPrompt, 'brand-report-depth', {
          maxTokens: 8000,
          tier: 'premium',
          model: process.env.DEPTH_MODEL || 'claude-sonnet-4-20250514',
        });
        try {
          const depthCleaned = depthRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const deepened = JSON.parse(depthCleaned);
          if (deepened.brand_identity && deepened.weakness_breakdown) {
            structured = deepened;
            console.log('  [Brand Report] Depth pass applied');
          } else {
            console.log('  [Brand Report] Depth pass returned invalid shape — kept original');
          }
        } catch (parseErr) {
          console.log('  [Brand Report] Depth pass JSON parse failed — kept original');
        }
      } catch (depthErr) {
        console.log('  [Brand Report] Depth pass failed (non-critical):', depthErr.message);
      }
    }

    // ── Validation pass: cross-check LLM claims against actual data ──
    if (structured) {
      console.log('  [Brand Report] Running validation pass...');
      try {
        const validationPrompt = `You are a data validation auditor. Cross-check the following brand report claims against the actual scraped data provided. Return ONLY valid JSON.

## Report Claims to Validate
${JSON.stringify({
  brand_archetype: structured.brand_identity?.brand_archetype,
  consistency_score: structured.brand_identity?.brand_consistency_score,
  overall_tone: structured.tone_and_pacing?.overall_tone,
  primary_icp_demographic: structured.target_audience?.primary_icp?.demographic,
  current_usp: structured.usp_and_contrarian_angles?.current_usp,
  critical_weaknesses: (structured.weakness_breakdown?.critical_weaknesses || []).map(w => w.weakness),
  competitive_disadvantages: (structured.weakness_breakdown?.competitive_disadvantages || []).map(d => d.area + ': ' + d.gap_size),
}, null, 2)}

## Actual Scraped Data
Client metrics: ${JSON.stringify(clientStats)}
Posts analysed: ${allPosts.length}
Post types: ${[...new Set(allPosts.map(p => p.postType))].join(', ')}
Platforms: ${[...new Set(allPosts.map(p => p.platform))].join(', ')}
Avg views: ${allPosts.length > 0 ? Math.round(allPosts.reduce((s, p) => s + (p.views || 0), 0) / allPosts.length) : 0}
Avg engagement: ${allPosts.length > 0 ? Math.round(allPosts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0) / allPosts.length) : 0}
Competitors: ${(competitors?.competitors || []).map(c => c.name + ' (avg views: ' + (c.tiktok?.avgViews || 0) + ')').join(', ')}
Sample captions: ${allPosts.slice(0, 5).map(p => (p.caption || '').slice(0, 100)).join(' | ')}

Return this JSON:
{
  "checks": [
    { "claim": "Brief description of what was checked", "status": "pass|warn|fail", "detail": "Explanation — reference actual numbers" }
  ],
  "overall_confidence": "High|Medium|Low",
  "summary": "One sentence overall assessment of report accuracy"
}

Rules:
- "pass" = claim is well-supported by data
- "warn" = claim is plausible but not directly verifiable from available data
- "fail" = claim contradicts the data
- Check at least 5 different claims
- Be strict — if there's no data to support a claim, mark it "warn" not "pass"
- Return ONLY valid JSON`;

        // Sonnet 4 for validation — more rigorous than cheap models, faster/cheaper than Opus
        const validationModel = process.env.VALIDATION_MODEL || 'claude-sonnet-4-20250514';
        const valRaw = await callLLM(validationPrompt, 'validation', {
          tier: 'premium',
          model: validationModel,
        });
        const valCleaned = valRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        structured.validation = JSON.parse(valCleaned);
        console.log(`  [Brand Report] Validation: ${structured.validation.overall_confidence} confidence`);
      } catch (valErr) {
        console.log('  [Brand Report] Validation pass failed (non-critical):', valErr.message);
      }
    }

    const reportData = {
      clientId,
      clientName,
      generatedAt: new Date().toISOString(),
      postsAnalysed: allPosts.length,
      competitorsAnalysed: competitors?.competitors?.length || 0,
      structured,
      raw: structured ? null : rawResponse,
    };
    saveClientFile(clientId, 'brand-report-latest.json', reportData);
    console.log(`  [Brand Report] Complete — cached to brand-report-latest.json`);

    // Notify: complete (with validation confidence if present)
    const durationMs = Date.now() - reportStartTs;
    const durationMin = (durationMs / 60000).toFixed(1);
    const confidence = reportData.structured?.validation?.overall_confidence;
    const battlecardCount = (reportData.structured?.competitor_battlecards || []).length;
    pushNotification(clientId, {
      type: 'brand_report_complete',
      title: `Brand report ready — ${clientName}`,
      body: `Generated in ${durationMin} min. ${battlecardCount} competitor battlecards. Validation: ${confidence || 'n/a'} confidence.`,
      priority: 'success',
      link: `/#brand/${clientId}`,
      meta: {
        durationMs,
        confidence,
        battlecardCount,
        postsAnalysed: reportData.postsAnalysed,
      },
    });

    res.json({ success: true, data: reportData });
  } catch (err) {
    console.error('Brand report error:', err);
    // Notify: failed so user isn't left wondering
    try {
      pushNotification(req.params.id || 'unknown', {
        type: 'brand_report_failed',
        title: `Brand report FAILED — ${req.params.id}`,
        body: `Error: ${(err.message || 'unknown').slice(0, 200)}`,
        priority: 'error',
      });
    } catch { /* swallow */ }
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/brand-report — get cached brand report
router.get('/:id/brand-report', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'brand-report-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No brand report yet.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/brand-report/download — download brand report as self-contained HTML
router.get('/:id/brand-report/download', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'brand-report-latest.json');
    if (!data?.structured) {
      return res.status(404).json({ success: false, error: 'No brand report to download.' });
    }

    const agency = readAgencyConfig();
    const html = buildReportHtml(data, agency);
    const filename = `brand-report-${data.clientId}-${data.structured.generated_date || 'latest'}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    console.error('Brand report download error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/brand-report/pdf — download brand report as PDF
router.get('/:id/brand-report/pdf', async (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'brand-report-latest.json');
    if (!data?.structured) {
      return res.status(404).json({ success: false, error: 'No brand report to download.' });
    }

    const agency = readAgencyConfig();
    const html = buildReportHtml(data, agency);

    console.log(`  [PDF] Generating PDF for ${req.params.id}...`);
    const pdfBuffer = await htmlToPdf(html);
    console.log(`  [PDF] Done — ${(pdfBuffer.length / 1024).toFixed(0)}KB`);

    const filename = `brand-report-${data.clientId}-${data.structured.generated_date || 'latest'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET/PUT /api/agency — agency branding config
router.get('/agency/config', (req, res) => {
  res.json({ success: true, data: readAgencyConfig() });
});

router.put('/agency/config', (req, res) => {
  try {
    const { name, tagline, logoUrl, accentColor, website } = req.body;
    const config = { name, tagline, logoUrl, accentColor, website, updatedAt: new Date().toISOString() };
    const configPath = join(ROOT, 'agency-config.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

function readAgencyConfig() {
  const configPath = join(ROOT, 'agency-config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

// POST /api/analyse/:id/topic-research — AI-powered topic research and filming list
router.post('/:id/topic-research', async (req, res) => {
  try {
    const clientId = req.params.id;
    const { topics, context } = req.body;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide at least one topic.' });
    }

    // Load client data for context
    const posts = readClientFile(clientId, 'posts-latest.json');
    const metrics = readClientFile(clientId, 'metrics-latest.json');
    const competitors = readClientFile(clientId, 'competitors-latest.json');
    const tasks = readClientFile(clientId, 'tasks.json');

    // Build post summaries
    let postContext = 'No post data available.';
    if (posts?.platforms) {
      const allPosts = [];
      for (const [platform, platformPosts] of Object.entries(posts.platforms)) {
        for (const post of platformPosts) {
          allPosts.push({ ...post, platform });
        }
      }
      if (allPosts.length > 0) {
        postContext = allPosts.slice(0, 30).map((p, i) => {
          const eng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
          return `Post ${i + 1} [${p.platform.toUpperCase()}] (${p.postType || 'Unknown'})
  Caption: ${(p.caption || '').slice(0, 200)}
  Likes: ${p.likes ?? '—'} | Comments: ${p.comments ?? '—'} | Shares: ${p.shares ?? '—'} | Views: ${p.views ?? '—'}
  Total engagement: ${eng}`;
        }).join('\n\n');
      }
    }

    // Build profile context
    let profileContext = 'No profile data available.';
    if (metrics?.platforms) {
      const profileData = {};
      for (const [p, data] of Object.entries(metrics.platforms)) {
        profileData[p] = {
          followers: data.followers || data.pageLikes || 0,
          totalLikes: data.likes || 0,
          following: data.following || 0,
          bio: data.bio || '',
        };
      }
      profileContext = JSON.stringify(profileData, null, 2);
    }

    // Build competitor context
    let competitorContext = 'No competitor data available.';
    if (competitors?.competitors?.length > 0) {
      competitorContext = competitors.competitors.map(c => {
        let summary = `### ${c.name} (${c.party || 'N/A'})`;
        if (c.tiktok?.videos?.length > 0) {
          const topVids = c.tiktok.videos.slice(0, 3).map((v, i) =>
            `  ${i + 1}. Views: ${v.views} | Likes: ${v.likes} | Caption: "${(v.caption || '').slice(0, 150)}"`
          ).join('\n');
          summary += `\nTikTok — Avg views: ${c.tiktok.avgViews}, Videos: ${c.tiktok.videos.length}\n${topVids}`;
        }
        if (c.instagram) {
          summary += `\nInstagram — Followers: ${c.instagram.followers || '?'}`;
        }
        return summary;
      }).join('\n\n');
    }

    // Build tasks/strategy context
    let tasksContext = '';
    if (tasks) {
      const parts = [];
      if (tasks.goals?.length) parts.push('Goals: ' + tasks.goals.map(g => g.text).join(', '));
      if (tasks.strategy?.length) parts.push('Strategy: ' + tasks.strategy.map(s => s.text).join(', '));
      if (tasks.filmingStyle?.length) parts.push('Filming style: ' + tasks.filmingStyle.map(f => f.text).join(', '));
      if (tasks.actionables?.length) parts.push('Action items: ' + tasks.actionables.map(a => `${a.text} (${a.status})`).join(', '));
      tasksContext = parts.length > 0 ? parts.join('\n') : '';
    }

    const topicsList = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `You are a senior social media content strategist and trend analyst. Analyse the following topics for a client and provide actionable research to guide their content production.

## Client Profile
${profileContext}

## Client's Recent Posts (engagement data)
${postContext}

## Competitor Landscape
${competitorContext}

${tasksContext ? `## Client's Current Strategy & Goals\n${tasksContext}\n` : ''}
${context ? `## Additional Context from Client\n${context}\n` : ''}
## Topics to Research
${topicsList}

## Your Task

Analyse each topic and return your response as **valid JSON** (no markdown wrapping, no code fences). Use British English throughout.

Return this exact JSON structure:
{
  "topicAnalysis": [
    {
      "topic": "the topic name",
      "trendScore": 8,
      "audienceRelevance": 9,
      "competition": 5,
      "viralPotential": 7,
      "recommendedAngle": "A specific hook or angle to differentiate",
      "reasoning": "Why these scores — reference current trends, competitor activity, and audience data"
    }
  ],
  "priorityRanking": [
    {
      "rank": 1,
      "topic": "the topic name",
      "reasoning": "Why this should be prioritised — based on trend momentum, audience fit, and competition gap"
    }
  ],
  "filmingList": [
    {
      "priority": "high",
      "topic": "the topic name",
      "format": "Reel",
      "hook": "First 3 seconds — the opening hook to grab attention",
      "talkingPoints": ["Key point 1", "Key point 2", "Key point 3"],
      "cta": "Call to action for the viewer",
      "estimatedTime": "30 min",
      "notes": "Production notes or tips"
    }
  ],
  "contentGaps": ["Topics competitors cover that the client hasn't explored"],
  "quickWins": [
    {
      "topic": "Easy win topic",
      "why": "Why this is a quick win — low effort, high potential",
      "effort": "low"
    }
  ]
}

Scoring guide:
- trendScore (1-10): How trending is this topic on social media right now?
- audienceRelevance (1-10): How relevant is this to the client's existing audience and niche?
- competition (1-10): How saturated is this topic? (10 = very saturated, hard to stand out)
- viralPotential (1-10): Based on similar posts that went viral, how likely is this to take off?

For the filming list:
- Format options: Reel, Carousel, Story, Live, TikTok, Long-form Video
- Priority levels: "high", "medium", "low"
- Order by priority (highest first)
- Be specific with hooks — write the actual opening line/visual
- Estimated time should be realistic production time

For content gaps: Look at what competitors are covering successfully that the client is NOT doing.
For quick wins: Topics that are easy to film AND likely to perform well based on the data.

Return ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON.`;

    console.log(`  [Topic Research] Analysing ${topics.length} topics for ${clientId}...`);
    const rawResponse = await callLLM(prompt);

    // Parse the response — strip markdown code fences if present
    let parsed;
    let isRaw = false;
    try {
      let cleaned = rawResponse.trim();
      // Strip markdown JSON code fences
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      parsed = JSON.parse(cleaned.trim());
    } catch (parseErr) {
      console.log('  [Topic Research] JSON parse failed, saving raw response');
      parsed = { raw: true, analysis: rawResponse };
      isRaw = true;
    }

    const result = {
      clientId,
      generatedAt: new Date().toISOString(),
      topicsRequested: topics,
      context: context || null,
      isRaw,
      ...parsed,
    };

    saveClientFile(clientId, 'topic-research-latest.json', result);
    console.log(`  [Topic Research] Complete — cached to topic-research-latest.json`);

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Topic research error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/analyse/:id/topic-research — get cached topic research
router.get('/:id/topic-research', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'topic-research-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No topic research yet. Submit topics to analyse first.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

export default router;
