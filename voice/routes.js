/**
 * Voice Agent Routes
 *
 * Express router exposing tool endpoints to the ElevenLabs
 * Conversational AI agent. Each POST endpoint matches one tool
 * defined in the ElevenLabs agent config.
 *
 * Security:
 *  - All routes require VOICE_WEBHOOK_SECRET header to prevent abuse
 *  - Rate-limit via per-IP counter (in-memory, fine for internal use)
 *  - Returns JSON with { speech: string } shape for agent consumption
 *
 * Cost guardrail:
 *  - /session/start enforces monthly minute cap read from .env.local
 *  - Logs every invocation for audit
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getClientSnapshot,
  getWeeklyMovers,
  getRecentAlerts,
  listActiveClients,
  getClientPosts,
  getAudienceAsks,
} from './tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_DIR = join(__dirname, '..', 'logs', 'voice');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const router = Router();

// ── Auth middleware ────────────────────────────────

function requireSecret(req, res, next) {
  const expected = process.env.VOICE_WEBHOOK_SECRET;
  if (!expected) {
    return res.status(503).json({ speech: 'Voice agent not configured.' });
  }
  const got = req.headers['x-voice-secret'] || req.body?.secret;
  if (got !== expected) {
    return res.status(403).json({ speech: 'Unauthorized.' });
  }
  next();
}

// ── Rate limit (per IP, simple) ────────────────────

const rateMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const window = 60_000; // 1 min
  const max = 30;        // 30 calls/min is plenty for voice

  const rec = rateMap.get(ip) || { count: 0, reset: now + window };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + window;
  }
  rec.count++;
  rateMap.set(ip, rec);

  if (rec.count > max) {
    return res.status(429).json({ speech: 'Too many requests. Slow down.' });
  }
  next();
}

// ── Usage logging + monthly cap ────────────────────

function logUsage(event, payload) {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...payload }) + '\n';
  const file = join(LOG_DIR, `${new Date().toISOString().slice(0, 7)}.jsonl`);
  try {
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
    writeFileSync(file, existing + line);
  } catch (err) {
    console.error('[Voice] Log write failed:', err.message);
  }
}

function getMonthMinutes() {
  const file = join(LOG_DIR, `${new Date().toISOString().slice(0, 7)}.jsonl`);
  if (!existsSync(file)) return 0;
  let total = 0;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.event === 'session_end' && rec.durationSec) {
        total += rec.durationSec / 60;
      }
    } catch { /* skip bad lines */ }
  }
  return total;
}

// ── Wrap tool handler (try/catch + log) ────────────

function wrapTool(name, handler) {
  return (req, res) => {
    const start = Date.now();
    try {
      const result = handler(req.body || {});
      logUsage('tool_call', { name, ms: Date.now() - start, ok: true });
      res.json(result);
    } catch (err) {
      console.error(`[Voice tool ${name}] error:`, err.message);
      logUsage('tool_call', { name, ms: Date.now() - start, ok: false, err: err.message });
      res.json({ speech: 'Something went wrong fetching that data.' });
    }
  };
}

// ── Routes ─────────────────────────────────────────

router.use(rateLimit);

// Public config — just the agent ID, no secrets
router.get('/config', (req, res) => {
  res.json({
    agentId: process.env.VOICE_AGENT_ID || null,
  });
});

// Session lifecycle — widget calls this to check cap before opening mic
router.get('/session/check', (req, res) => {
  const cap = parseFloat(process.env.VOICE_MONTHLY_MINUTE_CAP || '60');
  const used = getMonthMinutes();
  const remaining = Math.max(0, cap - used);
  res.json({
    allowed: remaining > 0,
    usedMinutes: Number(used.toFixed(1)),
    capMinutes: cap,
    remainingMinutes: Number(remaining.toFixed(1)),
  });
});

router.post('/session/start', requireSecret, (req, res) => {
  const cap = parseFloat(process.env.VOICE_MONTHLY_MINUTE_CAP || '60');
  const used = getMonthMinutes();
  if (used >= cap) {
    return res.status(429).json({
      speech: `Monthly voice budget used up. ${used.toFixed(0)} of ${cap} minutes spent.`,
      allowed: false,
    });
  }
  logUsage('session_start', { conversationId: req.body.conversationId });
  res.json({ allowed: true, sessionId: req.body.conversationId });
});

router.post('/session/end', requireSecret, (req, res) => {
  logUsage('session_end', {
    conversationId: req.body.conversationId,
    durationSec: req.body.durationSec || 0,
  });
  res.json({ ok: true });
});

// Tool endpoints — one per ElevenLabs agent tool
router.post('/tool/get_client_snapshot', requireSecret, wrapTool('get_client_snapshot', getClientSnapshot));
router.post('/tool/get_weekly_movers', requireSecret, wrapTool('get_weekly_movers', getWeeklyMovers));
router.post('/tool/get_recent_alerts', requireSecret, wrapTool('get_recent_alerts', getRecentAlerts));
router.post('/tool/list_active_clients', requireSecret, wrapTool('list_active_clients', () => listActiveClients()));
router.post('/tool/get_client_posts', requireSecret, wrapTool('get_client_posts', getClientPosts));
router.post('/tool/get_audience_asks', requireSecret, wrapTool('get_audience_asks', getAudienceAsks));

export default router;
