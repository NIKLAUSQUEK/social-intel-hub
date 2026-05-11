/**
 * Competitor discovery API — mount at /api/competitor-discovery
 */

import { Router } from 'express';
import {
  suggestCompetitorsForClient,
  getCompetitorSuggestions,
  applyApprovedCompetitors,
} from './suggest.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

// POST /api/competitor-discovery/:clientId/suggest — run discovery (2-3 min)
router.post('/:clientId/suggest', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const clientId = req.params.clientId;
  const startTs = Date.now();

  pushNotification(clientId, {
    type: 'competitor_discovery_started',
    title: `Competitor discovery started — ${clientId}`,
    body: 'Searching web + ranking with AI. Typically 30-90 seconds.',
    priority: 'info',
    link: `/competitor-discovery.html?client=${clientId}`,
  });

  try {
    const data = await suggestCompetitorsForClient(clientId);
    const durationMs = Date.now() - startTs;

    pushNotification(clientId, {
      type: 'competitor_discovery_complete',
      title: `${data.suggestionCount} competitor suggestions ready — ${clientId}`,
      body: `Review and approve in the dashboard.`,
      priority: 'success',
      link: `/competitor-discovery.html?client=${clientId}`,
      meta: { durationMs, suggestionCount: data.suggestionCount },
    });

    res.json({ success: true, data });
  } catch (err) {
    pushNotification(clientId, {
      type: 'competitor_discovery_failed',
      title: `Competitor discovery FAILED — ${clientId}`,
      body: err.message?.slice(0, 180),
      priority: 'error',
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/competitor-discovery/:clientId — read pending suggestions
router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const data = getCompetitorSuggestions(req.params.clientId);
  if (!data) return res.status(404).json({ success: false, error: 'No suggestions yet — run /suggest first' });
  res.json({ success: true, data });
});

// POST /api/competitor-discovery/:clientId/apply — approve specific suggestions
// Body:
//   { approvedNames: ["Name 1", "Name 2"] }                              (simple)
//   { approvals: [{ name: "Name 1", overrides: { instagram: "..." } }] }  (with handle overrides)
router.post('/:clientId/apply', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const approvals = Array.isArray(req.body?.approvals)
    ? req.body.approvals
    : (Array.isArray(req.body?.approvedNames) ? req.body.approvedNames : []);
  if (!approvals.length) return res.status(400).json({ success: false, error: 'No approvals provided' });

  try {
    const result = applyApprovedCompetitors(req.params.clientId, approvals);

    pushNotification(req.params.clientId, {
      type: 'competitors_added',
      title: `${result.added} competitors added — ${req.params.clientId}`,
      body: `Client now tracks ${result.totalNow} competitors. Re-run scrape to capture their metrics.`,
      priority: 'success',
      link: `/`,
      meta: result,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
