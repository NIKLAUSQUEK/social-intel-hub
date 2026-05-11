/**
 * Notifications service
 *
 * Per-client notification store:
 *   data/{clientId}/notifications.json  — append-only array (capped at 100)
 *
 * Global read:
 *   merges across all clients for a global notification center
 *
 * Usage:
 *   import { pushNotification, listForClient, listAll, markRead } from './service.js';
 *
 *   pushNotification('leong-mun-wai', {
 *     type: 'brand_report_complete',
 *     title: 'Brand report ready',
 *     body: 'Opus generated + Sonnet validated — confidence: High',
 *     priority: 'success',
 *     link: '/#brand/leong-mun-wai',
 *     meta: { model: 'claude-opus-4', durationMs: 180786 }
 *   });
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const MAX_PER_CLIENT = 100;

function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

function filePath(clientId) {
  return join(DATA_DIR, clientId, 'notifications.json');
}

function loadForClient(clientId) {
  if (!safeId(clientId)) return [];
  const f = filePath(clientId);
  if (!existsSync(f)) return [];
  try { return JSON.parse(readFileSync(f, 'utf-8')); }
  catch { return []; }
}

function saveForClient(clientId, notifications) {
  const f = filePath(clientId);
  const dir = dirname(f);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(f, JSON.stringify(notifications.slice(-MAX_PER_CLIENT), null, 2));
}

export function pushNotification(clientId, payload) {
  if (!safeId(clientId)) return null;

  const notif = {
    id: randomUUID(),
    clientId,
    type: payload.type || 'info',
    title: payload.title || '',
    body: payload.body || '',
    priority: payload.priority || 'info', // info | success | warn | error
    link: payload.link || null,
    meta: payload.meta || {},
    read: false,
    createdAt: new Date().toISOString(),
  };

  const list = loadForClient(clientId);
  list.push(notif);
  saveForClient(clientId, list);

  // Fire-and-forget Telegram push (if configured)
  maybeTelegram(notif).catch(() => { /* never throw */ });

  return notif;
}

export function listForClient(clientId, opts = {}) {
  const list = loadForClient(clientId);
  const filtered = opts.unreadOnly ? list.filter(n => !n.read) : list;
  return filtered.slice().reverse().slice(0, opts.limit || 50);
}

export function listAll(opts = {}) {
  if (!existsSync(DATA_DIR)) return [];
  const clients = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);

  const all = [];
  for (const cid of clients) {
    for (const n of loadForClient(cid)) {
      if (opts.unreadOnly && n.read) continue;
      all.push(n);
    }
  }
  all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return all.slice(0, opts.limit || 100);
}

export function markRead(clientId, notificationId) {
  const list = loadForClient(clientId);
  const n = list.find(x => x.id === notificationId);
  if (!n) return false;
  n.read = true;
  n.readAt = new Date().toISOString();
  saveForClient(clientId, list);
  return true;
}

export function markAllRead(clientId) {
  const list = loadForClient(clientId);
  let count = 0;
  for (const n of list) {
    if (!n.read) { n.read = true; n.readAt = new Date().toISOString(); count++; }
  }
  saveForClient(clientId, list);
  return count;
}

// ── Optional Telegram push ─────────────────────────

const PRIORITY_EMOJI = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌',
};

/**
 * Resolve the Telegram destination for a given clientId.
 *
 * Lookup order:
 *   1. TELEGRAM_CLIENT_ROUTING — JSON env var mapping clientId → { chat_id, message_thread_id? }
 *      Use message_thread_id for forum-topic supergroups (one topic per client).
 *      Example:
 *        TELEGRAM_CLIENT_ROUTING={"daniel-sim":{"chat_id":"-100123","message_thread_id":7},"jordan-yeoh":{"chat_id":"-100123","message_thread_id":12},"default":{"chat_id":"-100999"}}
 *   2. TELEGRAM_CHAT_ID — flat single-chat fallback (no per-client split)
 *   3. If neither, no push happens.
 */
function resolveTelegramRoute(clientId) {
  // 1. Per-client routing map
  const rawMap = process.env.TELEGRAM_CLIENT_ROUTING;
  if (rawMap) {
    try {
      const map = JSON.parse(rawMap);
      if (map[clientId]) return map[clientId];
      if (map.default)   return map.default;
    } catch {
      // Invalid JSON — fall through to flat fallback
    }
  }
  // 2. Flat fallback
  if (process.env.TELEGRAM_CHAT_ID) {
    return { chat_id: process.env.TELEGRAM_CHAT_ID };
  }
  return null;
}

async function maybeTelegram(notif) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const route = resolveTelegramRoute(notif.clientId);
  if (!route?.chat_id) return;

  // Priority filter — only push warn/error/success by default; set to 'info' to push everything
  const minPriority = process.env.TELEGRAM_MIN_PRIORITY || 'success';
  const ranks = { info: 0, success: 1, warn: 2, error: 3 };
  if (ranks[notif.priority] < ranks[minPriority]) return;

  const emoji = PRIORITY_EMOJI[notif.priority] || 'ℹ️';
  // Client tag is valuable for group chats where multiple clients share one chat
  const text =
    `${emoji} *${escapeMd(notif.title)}*\n` +
    `${escapeMd(notif.body || '')}\n\n` +
    `_Client: ${escapeMd(notif.clientId)}_`;

  const body = {
    chat_id: route.chat_id,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
  };
  // If the route specifies a forum topic, thread the message into it
  if (route.message_thread_id != null) {
    body.message_thread_id = Number(route.message_thread_id);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.log(`  [notif→telegram] HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`  [notif→telegram] failed: ${err.message}`);
  }
}

function escapeMd(s) {
  // MarkdownV2 escapes — keep simple
  return String(s || '').replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
