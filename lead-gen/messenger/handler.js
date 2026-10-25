/**
 * Comment-to-DM webhook handler (ManyChat-style "comment a keyword, get a DM").
 *
 *   1. Someone comments "PRICE" on your Facebook or Instagram post/ad
 *   2. A matching rule sends them one private reply from your Page
 *      (+ optional public reply under the comment)
 *   3. They're stored as an inbox lead — they started the conversation
 *   4. If they reply in Messenger/IG DM with an email or phone, it's added
 *      to the lead with consent recorded; "STOP" opts them out
 *
 * graph functions are injected so this is testable without network.
 */

import * as realGraph from './graph.js';
import { listRules, markProcessed, upsertInboxLead, isOptedOut } from './store.js';
import { extractEmails, extractPhones } from '../extract.js';
import { addSuppression } from '../index.js';

const STOP_RE = /^\s*(stop|unsubscribe|opt[\s-]?out|remove me)\b/i;

export function matchesKeyword(text, keywords) {
  const t = String(text || '').toLowerCase();
  return keywords.some(k => new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(t));
}

/** Normalise FB feed + IG comments changes into one shape. */
export function parseComments(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (body.object === 'page' && ch.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
        out.push({ platform: 'facebook', accountId: entry.id, commentId: v.comment_id, postId: v.post_id,
          text: v.message || '', userId: v.from?.id, userName: v.from?.name || '' });
      } else if (body.object === 'instagram' && ch.field === 'comments') {
        out.push({ platform: 'instagram', accountId: entry.id, commentId: v.id, postId: v.media?.id,
          text: v.text || '', userId: v.from?.id, userName: v.from?.username || '' });
      }
    }
  }
  return out.filter(c => c.commentId && c.userId && c.userId !== c.accountId); // skip our own replies
}

/** Inbound DMs (not echoes of our own messages). */
export function parseMessages(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const m of entry.messaging || []) {
      if (!m.message?.text || m.message.is_echo) continue;
      out.push({ platform: body.object === 'instagram' ? 'instagram' : 'facebook', accountId: entry.id,
        userId: m.sender?.id, text: m.message.text, at: m.timestamp });
    }
  }
  return out;
}

function ruleFor(c, rules) {
  return rules.find(r => r.active
    && (r.pageId === c.accountId || r.igUserId === c.accountId)
    && (!r.postId || c.postId?.endsWith(r.postId) || r.postId === c.postId)
    && matchesKeyword(c.text, r.keywords));
}

export async function handleWebhook(body, { graph = realGraph, rules = listRules() } = {}) {
  const actions = [];

  for (const c of parseComments(body)) {
    const rule = ruleFor(c, rules);
    if (!rule || isOptedOut(c.platform, c.userId) || !markProcessed(c.commentId)) continue;
    const now = new Date().toISOString();
    let status = 'contacted';
    try {
      await graph.sendPrivateReply(rule.pageId, c.commentId, rule.dmText);
      if (rule.publicReply) await graph.replyToComment(rule.pageId, c.commentId, rule.publicReply, c.platform);
      actions.push({ type: 'dm_sent', commentId: c.commentId, ruleId: rule.id });
    } catch (err) {
      status = 'dm-failed';
      actions.push({ type: 'dm_failed', commentId: c.commentId, error: err.message });
    }
    upsertInboxLead({
      platform: c.platform, userId: c.userId, name: c.userName, pageId: rule.pageId, ruleId: rule.id,
      source: 'comment-to-dm', status,
      events: [{ type: 'comment', text: c.text.slice(0, 500), postId: c.postId, commentId: c.commentId, at: now }],
    });
  }

  for (const m of parseMessages(body)) {
    const now = new Date().toISOString();
    if (STOP_RE.test(m.text)) {
      upsertInboxLead({ platform: m.platform, userId: m.userId, status: 'opted-out',
        events: [{ type: 'opt-out', text: m.text.slice(0, 200), at: now }] });
      addSuppression(`${m.platform}:${m.userId}`, 'messenger STOP');
      actions.push({ type: 'opted_out', userId: m.userId });
      continue;
    }
    const emails = extractEmails(m.text);
    const phones = extractPhones(m.text);
    const lead = upsertInboxLead({
      platform: m.platform, userId: m.userId, emails, phones,
      ...(emails.length || phones.length ? { status: 'qualified', consent: { given: true, via: 'messenger', at: now, text: m.text.slice(0, 300) } } : {}),
      events: [{ type: 'message', text: m.text.slice(0, 500), at: now }],
    });
    actions.push({ type: 'message_logged', userId: m.userId, captured: emails.length + phones.length });

    // One automatic follow-up when they share contact details (inside the 24h window)
    const rule = rules.find(r => r.id === lead.ruleId);
    if ((emails.length || phones.length) && rule?.followUp && !lead.followUpSent) {
      try {
        await graph.sendMessage(rule.pageId, m.userId, rule.followUp);
        upsertInboxLead({ platform: m.platform, userId: m.userId, followUpSent: true });
        actions.push({ type: 'follow_up_sent', userId: m.userId });
      } catch (err) {
        actions.push({ type: 'follow_up_failed', userId: m.userId, error: err.message });
      }
    }
  }
  return actions;
}
