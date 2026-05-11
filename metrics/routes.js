import { Router } from 'express';
import { recommendBestTimes, auditMetrics, analyseDayOfWeek, recommendBestTimesViaMeta } from './analyse.js';
import { checkMetaAvailable } from './meta-insights.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

router.get('/:clientId/best-times', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const data = recommendBestTimes(req.params.clientId);
  if (!data) return res.status(404).json({ success: false, error: 'No post data' });
  res.json({ success: true, data });
});

router.get('/:clientId/audit', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const data = auditMetrics(req.params.clientId);
  if (!data) return res.status(404).json({ success: false, error: 'No post data' });
  res.json({ success: true, data });
});

router.get('/:clientId/dow', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const data = analyseDayOfWeek(req.params.clientId);
  if (!data) return res.status(404).json({ success: false, error: 'No post data' });
  res.json({ success: true, data });
});

router.get('/_meta/status', async (_req, res) => {
  const s = await checkMetaAvailable();
  res.json({ success: s.ok, data: s });
});

router.get('/:clientId/best-times-meta', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  try {
    const data = await recommendBestTimesViaMeta(req.params.clientId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
