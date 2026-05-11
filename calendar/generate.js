/**
 * AI content calendar generator
 *
 * Given a client's profile, past performance, audience signals and strategic brand
 * insights, produce a rich 4-week plan per platform with:
 *   - Funnel tier per post (TOF / MOF / BOF)
 *   - Format + hook
 *   - Framework reference (Arc & Status, Hook-Retain-Deliver, PAS, etc.)
 *   - Batch-filming recommendations
 *   - Series continuation signals based on past performance
 *
 * Writes to data/{clientId}/content-calendar.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';
import { buildCalendarView } from './aggregate.js';
import { allFrameworks, HOOK_FRAMEWORKS, VIDEO_STRUCTURE_FRAMEWORKS, FUNNEL_GUIDANCE } from './frameworks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

// ── Main generate ──────────────────────────────────

export async function generateCalendar(clientId, opts = {}) {
  const platform = opts.platform || 'all';   // 'instagram' | 'tiktok' | 'linkedin' | 'all'
  const weeks = opts.weeks || 4;
  const startDate = opts.startDate ? new Date(opts.startDate) : new Date();

  // ── Gather context ──
  const clients = readJson(join(__dirname, '..', 'clients.json'))?.clients || [];
  const client = clients.find(c => c.id === clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const view = buildCalendarView(clientId);
  const brandReport = readJson(join(DATA_DIR, clientId, 'brand-report-latest.json'));
  const commentIntel = readJson(join(DATA_DIR, clientId, 'comment-intel.json'));

  // Keep the top 15 past performers, trimmed
  const topPast = view.past
    .filter(p => p.performance === 'high' || p.performance === 'mid')
    .slice(0, 15)
    .map(p => ({
      platform: p.platform,
      format: p.format,
      funnel: p.funnel,
      caption: (p.caption || '').slice(0, 120),
      metrics: p.metrics,
      contentType: p.contentType,
      hookType: p.hookType,
    }));

  // Detect repeat themes in top performers → "series to continue"
  const seriesSignals = detectSeries(topPast);

  // Audience asks
  const audienceIdeas = (commentIntel?.contentIdeas || []).slice(0, 10).map(i => ({
    topic: i.topic || i.title,
    format: i.format,
    intent: i.type,
    count: i.commentCount,
  }));

  const brandExec = brandReport?.structured?.executive_summary;
  const brandIdentity = brandReport?.structured?.brand_identity;
  const brandImperative = brandExec?.strategic_imperative;

  // ── Build the prompt ──
  const prompt = `You are a McKinsey-calibre content strategist producing a ${weeks}-week content calendar for one client.

CLIENT: ${client.name}
Niche: ${client.niche || 'not specified'}
Brand archetype: ${brandIdentity?.brand_archetype || 'not specified'}
Strategic imperative: ${brandImperative || 'establish category authority'}

PLATFORM SCOPE: ${platform}
START DATE: ${startDate.toISOString().slice(0, 10)}
WEEKS: ${weeks}

PAST TOP PERFORMERS (${topPast.length}):
${JSON.stringify(topPast, null, 2)}

DETECTED SERIES TO CONTINUE:
${JSON.stringify(seriesSignals, null, 2)}

AUDIENCE ASKS (from comment analysis):
${JSON.stringify(audienceIdeas, null, 2)}

FUNNEL TARGET MIX:
TOF (awareness) 60% — reach + retention
MOF (consideration) 30% — trust + authority + proof
BOF (conversion) 10% — direct ask

AVAILABLE FRAMEWORKS TO REFERENCE:
Hooks: ${HOOK_FRAMEWORKS.map(h => h.id).join(', ')}
Structures: ${VIDEO_STRUCTURE_FRAMEWORKS.map(s => s.id).join(', ')}

## Produce this JSON shape:

{
  "generatedAt": "ISO timestamp",
  "platform": "${platform}",
  "weeks": ${weeks},
  "strategy_narrative": "2-3 sentence narrative explaining the strategic arc across ${weeks} weeks",
  "funnel_targets": { "TOF": "60%", "MOF": "30%", "BOF": "10%" },
  "batching_plan": [
    {
      "filming_date": "YYYY-MM-DD (recommended Sat/Sun in the coming weeks)",
      "theme": "Unified theme for this shoot",
      "wardrobe_setting": "Suggested setting for consistency",
      "shot_list": ["topic 1 to film that day", "topic 2", "topic 3", "topic 4"],
      "outputs": "e.g. '4 Reels + 2 carousels + B-roll'"
    }
  ],
  "series_to_continue": [
    {
      "series_name": "Name a pattern detected in top performers",
      "evidence": "Specific past posts that performed well",
      "next_episodes": ["topic 1", "topic 2", "topic 3"]
    }
  ],
  "items": [
    {
      "id": "w1-mon-ig",
      "week": 1,
      "day": "Mon",
      "date": "YYYY-MM-DD",
      "platform": "instagram|tiktok|linkedin",
      "format": "Reel | Carousel | TikTok | LinkedIn post | Story",
      "funnel": "TOF | MOF | BOF",
      "pillar": "One of the client's content pillars",
      "topic": "Concrete topic title",
      "hook": "Actual first line — specific, not generic",
      "framework": {
        "hook_id": "hook-pattern-interrupt | hook-curiosity-gap | hook-result-first | hook-direct-question | hook-contrarian",
        "structure_id": "arc-status | hook-retain-deliver | problem-agitate-solution | mini-doc | day-in-the-life"
      },
      "batch_group": "YYYY-MM-DD matching one of the batching_plan dates if this can be filmed on that day",
      "expected_duration_sec": <15-90 for video, null for text/carousel>,
      "why_now": "One sentence on why this topic, why this week"
    }
  ],
  "weekly_themes": [
    { "week": 1, "theme": "Strategic theme for the week", "kpi_target": "Metric focus — e.g. reach, saves, DMs" }
  ]
}

RULES:
- Produce 12-18 items across ${weeks} weeks (roughly 3-5 posts per week)
- Match funnel target mix: ~60% TOF, ~30% MOF, ~10% BOF
- If platform is "all", mix platforms realistically; otherwise keep all items on the specified platform
- Reference real past performers when suggesting to continue a series
- Use audience asks for MOF/BOF content where possible
- Dates must be real upcoming dates starting from ${startDate.toISOString().slice(0, 10)}
- Batch groups: propose 1-2 filming days across ${weeks} weeks, each producing 4-6 items
- Hook field MUST be a specific opening line (not "Open with a strong hook")
- British English. No generic advice.
- Return ONLY the JSON object, no markdown fences.`;

  // Use Opus for depth, validation pass with Sonnet
  const raw = await callLLM(prompt, 'calendar-generate', {
    tier: 'premium',
    model: process.env.CALENDAR_MODEL || 'claude-opus-4-20250514',
    maxTokens: 8000,
  });

  let parsed;
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Calendar generate — JSON parse failed: ${err.message}`);
  }

  // Attach metadata + save
  parsed.clientId = clientId;
  parsed.clientName = client.name;
  parsed.generatedAt = new Date().toISOString();
  parsed.sourceSignals = {
    pastPerformersConsidered: topPast.length,
    audienceIdeasConsidered: audienceIdeas.length,
    seriesDetected: seriesSignals.length,
    hasBrandReport: !!brandReport,
  };

  // Ensure client dir exists
  const clientDir = join(DATA_DIR, clientId);
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });

  writeFileSync(
    join(clientDir, 'content-calendar.json'),
    JSON.stringify(parsed, null, 2)
  );

  return parsed;
}

// ── Helper: detect series in top performers ────────

function detectSeries(topPast) {
  if (!topPast.length) return [];

  // Group by contentType or hookType; a series is 2+ posts with same signal AND high perf
  const buckets = {};
  for (const p of topPast) {
    const key = p.contentType || p.hookType || p.format || 'misc';
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  }

  const series = [];
  for (const [key, items] of Object.entries(buckets)) {
    if (items.length >= 2) {
      const avgViews = items.reduce((s, i) => s + (i.metrics?.views || 0), 0) / items.length;
      series.push({
        pattern: key,
        postCount: items.length,
        avgViews: Math.round(avgViews),
        platforms: [...new Set(items.map(i => i.platform))],
        sampleCaptions: items.slice(0, 3).map(i => i.caption.slice(0, 80)),
      });
    }
  }

  return series.sort((a, b) => b.avgViews - a.avgViews);
}

// ── Manual edit / merge helpers ────────────────────

export function saveCalendar(clientId, calendarJson) {
  const clientDir = join(DATA_DIR, clientId);
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });
  writeFileSync(
    join(clientDir, 'content-calendar.json'),
    JSON.stringify(calendarJson, null, 2)
  );
}

export function loadCalendar(clientId) {
  const file = join(DATA_DIR, clientId, 'content-calendar.json');
  return readJson(file);
}
