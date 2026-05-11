/**
 * Voice Agent Tools
 *
 * Pure functions that read existing social-intel data and return
 * JSON payloads shaped for speech. Each function is exposed as a
 * webhook tool to the ElevenLabs Conversational AI agent.
 *
 * Design rules:
 *  - Return ≤ 500 chars of spoken text per tool response (latency + cost)
 *  - Never return raw JSON to the agent unless schema-typed
 *  - Fail soft: always return a speakable string, never throw
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── Helpers ────────────────────────────────────────

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function getClientsConfig() {
  return readJson(join(ROOT, 'clients.json')) || { clients: [] };
}

/**
 * Fuzzy-match client by spoken name. ElevenLabs STT output is messy
 * ("daniel sim" / "daniels sim" / "danielsim"), so we normalise hard.
 */
function findClient(query) {
  if (!query) return null;
  const { clients } = getClientsConfig();
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Exact id match
  let match = clients.find(c => c.id === query.toLowerCase());
  if (match) return match;

  // Normalised name match
  match = clients.find(c => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === q);
  if (match) return match;

  // Substring match
  match = clients.find(c =>
    c.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q) ||
    q.includes(c.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
  );
  return match || null;
}

function fmtNum(n) {
  if (n == null) return 'unknown';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDelta(delta) {
  if (delta == null || delta === 0) return 'flat';
  const sign = delta > 0 ? 'up' : 'down';
  return `${sign} ${fmtNum(Math.abs(delta))}`;
}

// ── Tool: get_client_snapshot ──────────────────────

export function getClientSnapshot({ clientName }) {
  const client = findClient(clientName);
  if (!client) {
    return {
      found: false,
      speech: `I couldn't find a client matching "${clientName}". Try saying their name again.`,
    };
  }

  const metrics = readJson(join(ROOT, 'data', client.id, 'metrics-latest.json'));
  if (!metrics) {
    return {
      found: true,
      speech: `${client.name} has no scrape data yet. Run the scraper first.`,
    };
  }

  const parts = [`Here's ${client.name}.`];
  const platforms = metrics.platforms || metrics;

  if (platforms.instagram?.followers != null) {
    parts.push(`Instagram: ${fmtNum(platforms.instagram.followers)} followers, ${platforms.instagram.posts || 0} posts.`);
  }
  if (platforms.tiktok?.followers != null) {
    parts.push(`TikTok: ${fmtNum(platforms.tiktok.followers)} followers, ${fmtNum(platforms.tiktok.likes || 0)} total likes.`);
  }
  if (platforms.linkedin?.followers != null) {
    parts.push(`LinkedIn: ${fmtNum(platforms.linkedin.followers)} followers.`);
  }

  return {
    found: true,
    clientId: client.id,
    speech: parts.join(' ').slice(0, 500),
  };
}

// ── Tool: get_weekly_movers ────────────────────────

export function getWeeklyMovers({ limit = 3 } = {}) {
  const { clients } = getClientsConfig();
  const movers = [];

  for (const c of clients) {
    if (!c.active) continue;
    const history = readJson(join(ROOT, 'data', c.id, 'history.json'));
    if (!history || !Array.isArray(history) || history.length < 2) continue;

    const latest = history[history.length - 1];
    const weekAgo = history[Math.max(0, history.length - 8)];

    const latestIG = latest.platforms?.instagram?.followers || 0;
    const oldIG = weekAgo.platforms?.instagram?.followers || 0;
    const delta = latestIG - oldIG;

    if (oldIG > 0) {
      movers.push({
        name: c.name,
        delta,
        pct: (delta / oldIG) * 100,
      });
    }
  }

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const top = movers.slice(0, limit);

  if (!top.length) {
    return { speech: 'No weekly movement data available yet. Need at least a week of scrape history.' };
  }

  const lines = top.map(m => `${m.name} is ${fmtDelta(m.delta)}, that's ${m.pct.toFixed(1)} percent.`);
  return { speech: `Top movers this week: ${lines.join(' ')}`.slice(0, 500) };
}

// ── Tool: get_recent_alerts ────────────────────────

export function getRecentAlerts({ limit = 5 } = {}) {
  const { clients } = getClientsConfig();
  const alerts = [];

  for (const c of clients) {
    if (!c.active) continue;
    const report = readJson(join(ROOT, 'data', c.id, 'report-latest.json'));
    if (!report?.alerts?.length) continue;

    for (const a of report.alerts.slice(0, 3)) {
      alerts.push({
        client: c.name,
        severity: a.severity || 'info',
        message: a.message || '',
      });
    }
  }

  // High severity first
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  const top = alerts.slice(0, limit);

  if (!top.length) {
    return { speech: 'No active alerts right now. Everything looks calm.' };
  }

  const lines = top.map(a => `${a.client}: ${a.message}`);
  return { speech: `Here are the top alerts. ${lines.join('. ')}`.slice(0, 500) };
}

// ── Tool: list_active_clients ──────────────────────

export function listActiveClients() {
  const { clients } = getClientsConfig();
  const active = clients.filter(c => c.active);
  return {
    count: active.length,
    speech: `You have ${active.length} active clients. Say a name to hear their numbers.`,
  };
}

// ── Tool: get_audience_asks ────────────────────────

export function getAudienceAsks({ clientName }) {
  const client = findClient(clientName);
  if (!client) {
    return { found: false, speech: `I couldn't find "${clientName}".` };
  }

  const intel = readJson(join(ROOT, 'data', client.id, 'comment-intel.json'));
  if (!intel) {
    return {
      found: true,
      speech: `No audience analysis yet for ${client.name}. Run the comments runner first.`,
    };
  }

  const ideas = (intel.contentIdeas || []).slice(0, 3);
  const questions = (intel.topQuestions || []).slice(0, 2);
  const sentNeg = Math.round((intel.sentiment?.negative || 0) * 100);

  const parts = [];
  parts.push(`${client.name}'s audience, based on ${intel.commentCount} comments.`);

  if (ideas.length) {
    parts.push(`Top content ideas:`);
    ideas.forEach((idea, i) => {
      parts.push(`${i + 1}. ${idea.title || idea.topic}.`);
    });
  }

  if (sentNeg > 15) {
    parts.push(`Note: ${sentNeg} percent negative sentiment — consider a response video.`);
  }

  if (questions.length) {
    parts.push(`Recurring question: ${questions[0].text?.slice(0, 100)}.`);
  }

  return {
    found: true,
    clientId: client.id,
    speech: parts.join(' ').slice(0, 500),
  };
}

// ── Tool: get_client_posts ─────────────────────────

export function getClientPosts({ clientName }) {
  const client = findClient(clientName);
  if (!client) {
    return { found: false, speech: `I couldn't find "${clientName}".` };
  }
  const posts = readJson(join(ROOT, 'data', client.id, 'posts-latest.json'));
  if (!posts?.length) {
    return { found: true, speech: `No post data for ${client.name}.` };
  }

  const recent = posts.slice(0, 3);
  const summary = recent.map((p, i) => {
    const views = p.views || p.likes || 0;
    return `Post ${i + 1}: ${fmtNum(views)} ${p.views ? 'views' : 'likes'}.`;
  }).join(' ');

  return {
    found: true,
    speech: `${client.name}'s last ${recent.length} posts. ${summary}`.slice(0, 500),
  };
}
