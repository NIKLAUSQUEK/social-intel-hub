/**
 * Response Priority Inbox
 *
 * Surfaces individual comments that demand an immediate reply for content/conversion ROI.
 *
 * Tier system:
 *   P0 — RESPOND NOW (questions, conversion intent, hot-takes, hate worth addressing)
 *   P1 — RESPOND TODAY (fan requests, tagged-creator interactions, sentiment swings)
 *   P2 — REPLY WHEN POSSIBLE (general engagement, low-stakes thanks)
 *
 * For each P0/P1, we also generate:
 *   - Suggested response in the client's voice
 *   - "Convert into content" suggestion if the comment hints at a video idea
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return null; }
}

// Quick-and-dirty intent classifier (free) — flags potentially priority comments before LLM
function quickTriage(text) {
  if (!text) return { intent: 'unknown', priority: 'P2' };
  const lower = text.toLowerCase();

  // P0 signals — questions + conversion intent + spicy
  if (/\?|how|where|when|can i|what's|how much|price|cost|book|sign up|join/.test(lower)) {
    return { intent: 'question_or_conversion', priority: 'P0' };
  }
  if (/dm|message|email|whatsapp|contact|interested|how do i|where can i/.test(lower)) {
    return { intent: 'conversion_intent', priority: 'P0' };
  }
  if (/wrong|disagree|actually|but|no it's|that's not|propaganda|fake|lying/.test(lower) && text.length > 30) {
    return { intent: 'disagreement_worth_engaging', priority: 'P0' };
  }

  // P1 — fan requests, references, deeper engagement
  if (/please make|do a video|content on|topic|love it when|would love|next video|series/.test(lower)) {
    return { intent: 'fan_request', priority: 'P1' };
  }
  if (/@[a-zA-Z0-9._]+/.test(text)) {
    return { intent: 'tagged_someone', priority: 'P1' };
  }
  if (text.length > 60) {
    return { intent: 'long_engagement', priority: 'P1' };
  }

  // P2 — short emoji, general support
  return { intent: 'general_support', priority: 'P2' };
}

// ── Public ─────────────────────────────────────────

export async function computeResponsePriority(clientId, opts = {}) {
  const intel = readJson(join(DATA_DIR, clientId, 'comment-intel.json'));
  if (!intel) throw new Error('No comment-intel — run comments/run.js first');

  const clientsFile = join(ROOT, 'clients.json');
  const all = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = all.find(c => c.id === clientId);
  const niche = client?.niche || '';

  // Pull tone signals from brand report if available
  const brandReport = readJson(join(DATA_DIR, clientId, 'brand-report-latest.json'));
  const tone = brandReport?.structured?.tone_and_pacing?.overall_tone || 'conversational, on-brand';

  // Combine all comments from intel into one pool
  const pool = [];
  for (const arr of [intel.fanRequests || [], intel.topQuestions || [], intel.hateComments || []]) {
    for (const c of arr) {
      pool.push({
        text: c.text,
        author: c.author || c.username || c.user || 'unknown',
        platform: c.platform || 'unknown',
        topic: c.topic,
        intentType: c.intentType,
        sentiment: c.sentiment,
      });
    }
  }
  if (!pool.length) return { clientId, generatedAt: new Date().toISOString(), totalComments: 0, queue: [], message: 'No comments in pool' };

  // Quick-triage every comment
  const triaged = pool.map(c => ({ ...c, ...quickTriage(c.text) }));

  // Surface up to 20 top-priority candidates for LLM scoring
  const candidates = triaged
    .sort((a, b) => {
      const pri = { P0: 0, P1: 1, P2: 2 };
      return (pri[a.priority] ?? 9) - (pri[b.priority] ?? 9);
    })
    .slice(0, 20);

  // LLM scores + drafts responses for top candidates
  let scored = candidates;
  if (!opts.skipLLM && candidates.length) {
    try {
      scored = await llmScoreAndDraft(candidates, client, niche, tone);
    } catch (err) {
      console.log('[response-priority] LLM scoring failed:', err.message);
    }
  }

  // Re-sort post-LLM
  scored.sort((a, b) => {
    const pri = { P0: 0, P1: 1, P2: 2 };
    return (pri[a.priority] ?? 9) - (pri[b.priority] ?? 9);
  });

  const counts = scored.reduce((acc, c) => {
    acc[c.priority] = (acc[c.priority] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    clientId,
    generatedAt: new Date().toISOString(),
    tone,
    totalComments: pool.length,
    triaged: triaged.length,
    queue: scored,
    counts,
  };

  const dir = join(DATA_DIR, clientId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'response-priority.json'), JSON.stringify(payload, null, 2));
  return payload;
}

async function llmScoreAndDraft(candidates, client, niche, tone) {
  const list = candidates.slice(0, 20);
  const prompt = `You are managing a creator's comment-reply inbox. For each comment, decide:
1. Final priority (P0 RESPOND NOW / P1 TODAY / P2 LATER)
2. Reason (1 short sentence)
3. Draft response in the creator's voice (max 30 words, NO em-dashes, plain English)
4. "convertToContent" — if this comment hints at a video idea, return one short suggestion

CREATOR: ${client?.name}
Niche: ${niche}
Tone descriptor: ${tone}

COMMENTS (each with current quick-triage):
${list.map((c, i) => `[${i}] (${c.priority} · ${c.intent} · ${c.platform || 'plat?'}) "${(c.text||'').slice(0,200)}" — by @${c.author||'?'}`).join('\n')}

Return ONLY JSON with root key "items":
{
  "items": [
    {
      "idx": 0,
      "priority": "P0|P1|P2",
      "reason": "one sentence",
      "draftResponse": "the actual reply text in creator's voice (or empty if not worth replying)",
      "convertToContent": "video idea or empty",
      "riskOfReply": "safe | spicy | skip"
    }
  ]
}

Rules:
- P0 = ANY comment with question, conversion intent, or constructive disagreement worth engaging publicly
- P1 = fan requests, tagged users, longer engagement, sentiment shift signals
- P2 = generic support / emoji-only / not actionable
- Drafts must sound like the creator, not generic. Match niche.
- skip riskOfReply for hate comments without merit
- British English`;

  const raw = await callLLM(prompt, 'response-priority-score', {
    maxTokens: 4000,
    tier: 'premium',
    model: process.env.RESPONSE_PRIORITY_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const s = cleaned.search(/[{\[]/);
  if (s > 0) cleaned = cleaned.slice(s);
  // Trim trailing junk after last } or ]
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (lastBrace > 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (err) {
    console.error('[response-priority] parse failed:', err.message);
    console.error('[response-priority] raw start:', raw.slice(0, 300));
    return candidates;
  }

  // Fuzzy root-key — accept any array of objects
  let llmItems = parsed.items || parsed.results || parsed.queue || parsed.comments || parsed.responses;
  if (!llmItems && Array.isArray(parsed)) llmItems = parsed;
  if (!llmItems && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        llmItems = v;
        console.log(`  [response-priority] using key "${k}" (${v.length} items)`);
        break;
      }
    }
  }
  if (!llmItems?.length) {
    console.error('[response-priority] no items array found. Root keys:', Object.keys(parsed||{}));
    return candidates;
  }

  // Merge — try idx match first, fall back to position-based
  return candidates.map((c, i) => {
    const m = llmItems.find(x => x.idx === i || x.index === i) || llmItems[i];
    if (!m) return c;
    return {
      ...c,
      author: c.author || 'unknown',
      priority: m.priority || m.tier || c.priority,
      reason: m.reason || m.why || m.rationale || '',
      draftResponse: m.draftResponse || m.draft_response || m.reply || m.draft || '',
      convertToContent: m.convertToContent || m.convert_to_content || m.content_idea || '',
      riskOfReply: (m.riskOfReply || m.risk_of_reply || m.risk || 'safe').toLowerCase(),
    };
  });
}

export function getResponsePriority(clientId) {
  const f = join(DATA_DIR, clientId, 'response-priority.json');
  return readJson(f);
}
