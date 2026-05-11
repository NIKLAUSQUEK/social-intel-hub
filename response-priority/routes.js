import { Router } from 'express';
import { computeResponsePriority, getResponsePriority } from './analyse.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const d = getResponsePriority(req.params.clientId);
  if (!d) return res.status(404).json({ success: false, error: 'No queue yet — POST /compute' });
  res.json({ success: true, data: d });
});

router.post('/:clientId/compute', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const startTs = Date.now();
  try {
    const data = await computeResponsePriority(req.params.clientId);
    const p0 = data.counts?.P0 || 0;
    pushNotification(req.params.clientId, {
      type: 'response_priority_ready',
      title: `Response queue ready — ${req.params.clientId}`,
      body: `${p0} P0 (respond now) · ${data.counts?.P1 || 0} P1 (today) · ${data.counts?.P2 || 0} P2`,
      priority: p0 > 0 ? 'warn' : 'success',
      link: `/deep-dive.html?client=${req.params.clientId}`,
      meta: { durationMs: Date.now() - startTs, P0: p0 },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
