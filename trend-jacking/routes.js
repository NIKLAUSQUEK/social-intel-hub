import { Router } from 'express';
import { refreshTrends, getTrends, generateTrendJacksForClient, getTrendJacksForClient } from './fetch.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

// GET /api/trend-jacking — global trend feed
router.get('/', (_req, res) => {
  const d = getTrends();
  if (!d) return res.status(404).json({ success: false, error: 'No trends yet — POST /refresh' });
  res.json({ success: true, data: d });
});

// POST /api/trend-jacking/refresh — rebuild global trend feed
router.post('/refresh', async (_req, res) => {
  const startTs = Date.now();
  pushNotification('_system', {
    type: 'trend_jack_refresh_started',
    title: 'Trend-jacking refresh started',
    body: 'Scanning web for hot topics. 60-90s.',
    priority: 'info',
    link: '/trend-jacking.html',
  });
  try {
    const data = await refreshTrends();
    pushNotification('_system', {
      type: 'trend_jack_refresh_complete',
      title: 'Trend-jacking ready',
      body: `${data.count} trends extracted from ${data.sourceCount} articles.`,
      priority: 'success',
      link: '/trend-jacking.html',
      meta: { durationMs: Date.now() - startTs, count: data.count },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/trend-jacking/:clientId — cached per-client matches + copy
router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const d = getTrendJacksForClient(req.params.clientId);
  if (!d) return res.status(404).json({ success: false, error: 'No trend-jacks yet for this client — POST /generate' });
  res.json({ success: true, data: d });
});

// POST /api/trend-jacking/:clientId/generate — build per-client matches + copy
router.post('/:clientId/generate', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const startTs = Date.now();
  pushNotification(req.params.clientId, {
    type: 'trend_jack_gen_started',
    title: `Trend-jacking started — ${req.params.clientId}`,
    body: 'Scoring relevance + writing copy. 60-120s.',
    priority: 'info',
    link: `/trend-jacking.html?client=${req.params.clientId}`,
  });
  try {
    const data = await generateTrendJacksForClient(req.params.clientId);
    pushNotification(req.params.clientId, {
      type: 'trend_jack_gen_complete',
      title: `Trend-jacks ready — ${req.params.clientId}`,
      body: `${data.relevantTrends} relevant trends with copy, ${data.totalTrends} total scored.`,
      priority: 'success',
      link: `/trend-jacking.html?client=${req.params.clientId}`,
      meta: { durationMs: Date.now() - startTs, relevantTrends: data.relevantTrends },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
