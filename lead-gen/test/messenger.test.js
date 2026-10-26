import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHmac } from 'crypto';

process.env.LEADGEN_DATA_DIR = mkdtempSync(join(tmpdir(), 'leads-dm-'));
const { handleWebhook, matchesKeyword, parseComments } = await import('../messenger/handler.js');
const { verifySignature } = await import('../messenger/graph.js');
const { saveRule, listInbox } = await import('../messenger/store.js');
const { parseFollowers, tierFor } = await import('../sources/creators.js');
const { scoreLead, makeLead } = await import('../lead.js');

const PAGE = '111';
const fbComment = (id, text, from = { id: 'u1', name: 'Amy Tan' }) => ({
  object: 'page',
  entry: [{ id: PAGE, changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: id, post_id: `${PAGE}_999`, message: text, from } }] }],
});
const dm = (text, sender = 'u1') => ({ object: 'page', entry: [{ id: PAGE, messaging: [{ sender: { id: sender }, message: { text } }] }] });

function fakeGraph() {
  const calls = [];
  return {
    calls,
    sendPrivateReply: async (...a) => calls.push(['private', ...a]),
    replyToComment: async (...a) => calls.push(['public', ...a]),
    sendMessage: async (...a) => calls.push(['message', ...a]),
  };
}

let rule;
before(() => {
  rule = saveRule({ pageId: PAGE, postId: '999', keywords: 'PRICE, info', dmText: 'Here is our price list! Reply with your email for the brochure.',
    publicReply: 'Sent you a DM 📩', followUp: 'Thanks, brochure on its way.' });
});

test('keyword matching is whole-word and case-insensitive', () => {
  assert.equal(matchesKeyword('Price pls!', ['PRICE']), true);
  assert.equal(matchesKeyword('priceless', ['PRICE']), false);
});

test('own page comments are ignored', () => {
  assert.equal(parseComments(fbComment('c0', 'PRICE', { id: PAGE, name: 'Page' })).length, 0);
});

test('keyword comment → one private reply + public reply + inbox lead', async () => {
  const g = fakeGraph();
  await handleWebhook(fbComment('c1', 'price?'), { graph: g, rules: [rule] });
  assert.deepEqual(g.calls.map(c => c[0]), ['private', 'public']);
  assert.equal(g.calls[0][2], 'c1');
  // Meta retries the same event — no second DM
  await handleWebhook(fbComment('c1', 'price?'), { graph: g, rules: [rule] });
  assert.equal(g.calls.length, 2);
  const lead = listInbox().find(l => l.userId === 'u1');
  assert.equal(lead.status, 'contacted');
  assert.equal(lead.name, 'Amy Tan');
});

test('non-matching comment or other post is ignored', async () => {
  const g = fakeGraph();
  await handleWebhook(fbComment('c2', 'nice photo'), { graph: g, rules: [rule] });
  const other = fbComment('c3', 'PRICE');
  other.entry[0].changes[0].value.post_id = `${PAGE}_123`;
  await handleWebhook(other, { graph: g, rules: [rule] });
  assert.equal(g.calls.length, 0);
});

test('DM reply with email → qualified with consent + one follow-up', async () => {
  const g = fakeGraph();
  await handleWebhook(dm('sure, amy.tan@gmail.com'), { graph: g, rules: [rule] });
  await handleWebhook(dm('also +65 9123 4567'), { graph: g, rules: [rule] });
  const lead = listInbox().find(l => l.userId === 'u1');
  assert.deepEqual(lead.emails, ['amy.tan@gmail.com']);
  assert.deepEqual(lead.phones, ['+6591234567']);
  assert.equal(lead.status, 'qualified');
  assert.equal(lead.consent.given, true);
  assert.deepEqual(g.calls.map(c => c[0]), ['message']);
});

test('STOP opts out and blocks future DMs', async () => {
  const g = fakeGraph();
  await handleWebhook(dm('STOP', 'u2'), { graph: g, rules: [rule] });
  await handleWebhook(fbComment('c4', 'PRICE', { id: 'u2', name: 'Bob' }), { graph: g, rules: [rule] });
  assert.equal(g.calls.length, 0);
  assert.equal(listInbox().find(l => l.userId === 'u2').status, 'opted-out');
});

test('instagram comment uses the page to send', async () => {
  const igRule = { ...rule, id: 'ig', igUserId: '178', postId: '' };
  const g = fakeGraph();
  await handleWebhook({ object: 'instagram', entry: [{ id: '178', changes: [{ field: 'comments',
    value: { id: 'ig1', text: 'info please', from: { id: 'igu', username: 'amy' }, media: { id: 'm1' } } }] }] },
  { graph: g, rules: [igRule] });
  assert.deepEqual(g.calls[0], ['private', PAGE, 'ig1', igRule.dmText]);
  assert.equal(g.calls[1][4], 'instagram');
});

test('webhook signature check', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 's3cret'), true);
  assert.equal(verifySignature(body, sig, 'wrong'), false);
  assert.equal(verifySignature(body, undefined, 's3cret'), false);
});

test('creator follower parsing, tiers and scoring', () => {
  assert.equal(parseFollowers('12.3K Followers, 210 Following, 800 Posts'), 12300);
  assert.equal(parseFollowers('1,204 followers'), 1204);
  assert.equal(parseFollowers('1.2M subscribers'), 1200000);
  assert.equal(parseFollowers('no count'), null);
  assert.equal(tierFor(12300), 'micro');
  assert.equal(tierFor(null), 'unknown');
  const c = { ...makeLead({ platform: 'instagram', evidence: [] }), kind: 'creator', tier: 'micro' };
  assert.equal(scoreLead(c), 25);
});

test('failed DM is recorded as dm-failed', async () => {
  const g = { ...fakeGraph(), sendPrivateReply: async () => { throw new Error('Graph 400'); } };
  await handleWebhook(fbComment('c5', 'PRICE', { id: 'u3', name: 'Cat' }), { graph: g, rules: [rule] });
  assert.equal(listInbox().find(l => l.userId === 'u3').status, 'dm-failed');
});
