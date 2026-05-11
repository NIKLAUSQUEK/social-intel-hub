/**
 * Notifications API router
 * Mount at /api/notifications
 */

import { Router } from 'express';
import { listAll, listForClient, markRead, markAllRead, pushNotification } from './service.js';

const router = Router();

function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

// GET /api/notifications  — global feed (all clients, most recent first)
router.get('/', (req, res) => {
  const unread = req.query.unread === '1' || req.query.unread === 'true';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json({ notifications: listAll({ unreadOnly: unread, limit }) });
});

// GET /api/notifications/unread-count — badge count
router.get('/unread-count', (req, res) => {
  const all = listAll({ unreadOnly: true, limit: 9999 });
  res.json({ count: all.length });
});

// GET /api/notifications/:clientId — per-client feed
router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const unread = req.query.unread === '1' || req.query.unread === 'true';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json({ notifications: listForClient(req.params.clientId, { unreadOnly: unread, limit }) });
});

// POST /api/notifications/:clientId/:id/read
router.post('/:clientId/:id/read', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const ok = markRead(req.params.clientId, req.params.id);
  res.json({ success: ok });
});

// POST /api/notifications/:clientId/read-all
router.post('/:clientId/read-all', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const count = markAllRead(req.params.clientId);
  res.json({ success: true, marked: count });
});

// POST /api/notifications/test/:clientId — manual test trigger (dev only)
router.post('/test/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const n = pushNotification(req.params.clientId, {
    type: 'test',
    title: 'Test notification',
    body: 'This is a manual test from /api/notifications/test',
    priority: 'info',
  });
  res.json({ success: true, notification: n });
});

export default router;
