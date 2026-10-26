/**
 * Comment-to-DM API — mount at /api/leads/dm
 *
 *   GET  /webhook          Meta verification handshake (hub.challenge)
 *   POST /webhook          Meta events (signature-checked with META_APP_SECRET)
 *   GET  /rules · POST /rules · DELETE /rules/:id
 *   GET  /inbox            people who commented / messaged
 *   GET  /inbox/export.csv
 */

import { Router } from 'express';
import { verifySignature } from './graph.js';
import { handleWebhook } from './handler.js';
import { listRules, saveRule, deleteRule, listInbox } from './store.js';

const router = Router();

router.get('/webhook', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe'
    && process.env.META_VERIFY_TOKEN
    && req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN;
  if (!ok) return res.sendStatus(403);
  res.status(200).send(String(req.query['hub.challenge'] || ''));
});

router.post('/webhook', (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  // Ack fast — Meta retries slow webhooks
  res.sendStatus(200);
  handleWebhook(req.body)
    .then(a => a.length && console.log('[dm]', JSON.stringify(a)))
    .catch(err => console.error('[dm] webhook failed:', err.message));
});

router.get('/rules', (req, res) => res.json({ success: true, data: listRules() }));

router.post('/rules', (req, res) => {
  try {
    res.json({ success: true, data: saveRule(req.body || {}) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/rules/:id', (req, res) => {
  deleteRule(req.params.id);
  res.json({ success: true });
});

router.get('/inbox', (req, res) => {
  res.json({ success: true, data: listInbox().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
});

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

router.get('/inbox/export.csv', (req, res) => {
  const cols = ['name', 'platform', 'userId', 'status', 'emails', 'phones', 'consentAt', 'firstComment', 'createdAt'];
  const rows = listInbox().filter(l => l.status !== 'opted-out').map(l => [
    l.name, l.platform, l.userId, l.status, (l.emails || []).join('; '), (l.phones || []).join('; '),
    l.consent?.at || '', l.events?.find(e => e.type === 'comment')?.text || '', l.createdAt,
  ].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dm-leads.csv"');
  res.send([cols.join(','), ...rows].join('\n'));
});

export default router;
