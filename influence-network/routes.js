import { Router } from 'express';
import { computeInfluenceNetwork, getInfluenceNetwork } from './analyse.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();
function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const d = getInfluenceNetwork(req.params.clientId);
  if (!d) return res.status(404).json({ success: false, error: 'No influence network yet — POST /compute' });
  res.json({ success: true, data: d });
});

router.post('/:clientId/compute', async (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const startTs = Date.now();
  try {
    const data = await computeInfluenceNetwork(req.params.clientId);
    pushNotification(req.params.clientId, {
      type: 'influence_network_ready',
      title: `Influence network ready — ${req.params.clientId}`,
      body: `${data.signals.topMentions.length} mentions · ${data.signals.topCommenters.length} engaged commenters · ${data.insight ? 'LLM insight generated' : 'raw signals only'}`,
      priority: 'success',
      link: `/influence.html?client=${req.params.clientId}`,
      meta: { durationMs: Date.now() - startTs },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
