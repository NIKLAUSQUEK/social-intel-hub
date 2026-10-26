/**
 * Comment-to-DM storage: keyword rules, processed comment ids, inbox leads.
 * JSON files under DATA_DIR/messenger/.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from '../paths.js';

const DIR = join(DATA_DIR, 'messenger');
const file = name => join(DIR, `${name}.json`);

function read(name, fallback) {
  try { return JSON.parse(readFileSync(file(name), 'utf-8')); } catch { return fallback; }
}
function write(name, data) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file(name), JSON.stringify(data, null, 2));
}

// ── Rules ──────────────────────────────────────────
// { id, name, pageId, igUserId?, postId?, keywords[], dmText, publicReply?, followUp?, active }

export function listRules() { return read('rules', []); }

export function saveRule(input) {
  const rules = listRules();
  const keywords = (Array.isArray(input.keywords) ? input.keywords : String(input.keywords || '').split(','))
    .map(k => k.trim()).filter(Boolean);
  if (!input.pageId || !keywords.length || !input.dmText) throw new Error('pageId, keywords and dmText are required');
  const rule = {
    id: input.id || randomUUID(),
    name: String(input.name || keywords.join(', ')).slice(0, 120),
    pageId: String(input.pageId),
    igUserId: input.igUserId ? String(input.igUserId) : '',
    postId: input.postId ? String(input.postId) : '',
    keywords,
    dmText: String(input.dmText).slice(0, 2000),
    publicReply: String(input.publicReply || '').slice(0, 500),
    followUp: String(input.followUp || '').slice(0, 1000),
    active: input.active !== false,
  };
  const i = rules.findIndex(r => r.id === rule.id);
  if (i > -1) rules[i] = rule; else rules.push(rule);
  write('rules', rules);
  return rule;
}

export function deleteRule(id) {
  write('rules', listRules().filter(r => r.id !== id));
}

// ── Processed comments (each comment gets at most one DM) ─

export function markProcessed(commentId) {
  const seen = read('processed', []);
  if (seen.includes(commentId)) return false;
  seen.push(commentId);
  write('processed', seen.slice(-50_000));
  return true;
}

// ── Inbox leads (people who commented / messaged) ───

export function listInbox() { return read('inbox', []); }

/** Insert or merge by platform + user id. */
export function upsertInboxLead(patch) {
  const inbox = listInbox();
  const key = `${patch.platform}:${patch.userId}`;
  let lead = inbox.find(l => `${l.platform}:${l.userId}` === key);
  if (!lead) {
    lead = { id: randomUUID(), emails: [], phones: [], events: [], createdAt: new Date().toISOString(), ...patch, };
    lead.events = patch.events || [];
    inbox.push(lead);
  } else {
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'emails' || k === 'phones') lead[k] = [...new Set([...(lead[k] || []), ...v])];
      else if (k === 'events') lead.events.push(...v);
      else if (v !== undefined && v !== '') lead[k] = v;
    }
  }
  lead.updatedAt = new Date().toISOString();
  write('inbox', inbox);
  return lead;
}

export function isOptedOut(platform, userId) {
  return listInbox().some(l => l.platform === platform && l.userId === userId && l.status === 'opted-out');
}
