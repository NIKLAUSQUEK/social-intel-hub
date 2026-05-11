import { Router } from 'express';
import { computePerformance, getPerformance } from './analyse.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const d = getPerformance(req.params.clientId);
  if (!d) return res.status(404).json({ success: false, error: 'No analysis yet — POST /compute' });
  res.json({ success: true, data: d });
});

router.post('/:clientId/compute', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const startTs = Date.now();
  try {
    const data = await computePerformance(req.params.clientId);
    pushNotification(req.params.clientId, {
      type: 'content_performance_ready',
      title: `Content performance ready — ${req.params.clientId}`,
      body: `${data.totalPosts} posts analysed · ${data.topics?.topics?.length || 0} topics clustered`,
      priority: 'success',
      link: `/deep-dive.html?client=${req.params.clientId}`,
      meta: { durationMs: Date.now() - startTs },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
