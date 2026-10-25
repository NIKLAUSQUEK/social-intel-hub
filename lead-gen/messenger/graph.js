/**
 * Meta Graph API calls for comment-to-DM — official endpoints only.
 *
 *   Private reply: one DM per comment, within 7 days of the comment,
 *   sent from your Page (works for Facebook and for Instagram accounts
 *   linked to the Page). After the person replies, the standard 24-hour
 *   messaging window applies.
 *
 * Env: META_PAGE_ACCESS_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN, META_GRAPH_VERSION
 */

import { createHmac, timingSafeEqual } from 'crypto';

const VERSION = () => process.env.META_GRAPH_VERSION || 'v21.0';

/** Check X-Hub-Signature-256 against the raw request body. */
export function verifySignature(rawBody, header, secret = process.env.META_APP_SECRET) {
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

async function post(path, body, token) {
  const res = await fetch(`https://graph.facebook.com/${VERSION()}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Graph ${path} ${res.status}: ${j.error?.message || 'error'}`);
  return j;
}

function tokenFor(pageId) {
  // Per-page tokens: META_PAGE_TOKEN_<pageId>; fallback to the single-page token
  return process.env[`META_PAGE_TOKEN_${pageId}`] || process.env.META_PAGE_ACCESS_TOKEN;
}

/** DM the commenter privately (Facebook or Instagram comment id). */
export function sendPrivateReply(pageId, commentId, text) {
  return post(`${pageId}/messages`, { recipient: { comment_id: commentId }, message: { text } }, tokenFor(pageId));
}

/** Public reply under the comment ("Sent you a DM!"). */
export function replyToComment(pageId, commentId, text, platform = 'facebook') {
  const path = platform === 'instagram' ? `${commentId}/replies` : `${commentId}/comments`;
  return post(path, { message: text }, tokenFor(pageId));
}

/** Regular Messenger reply inside the 24h window (follow-up questions). */
export function sendMessage(pageId, psid, text) {
  return post(`${pageId}/messages`, { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text } }, tokenFor(pageId));
}
