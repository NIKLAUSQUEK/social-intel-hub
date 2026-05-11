import { Router } from 'express';
import { refreshTrendingTechniques, getTrendingTechniques } from './fetch.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();

router.get('/', (_req, res) => {
  const d = getTrendingTechniques();
  if (!d) return res.status(404).json({ success: false, error: 'No data yet — POST /refresh' });
  res.json({ success: true, data: d });
});

router.post('/refresh', async (_req, res) => {
  const startTs = Date.now();
  pushNotification('_system', {
    type: 'techniques_refresh_started',
    title: 'Trending techniques refresh started',
    body: 'Scanning web for viral edits + SFX. 60-90s.',
    priority: 'info',
    link: '/trending-techniques.html',
  });
  try {
    const data = await refreshTrendingTechniques();
    pushNotification('_system', {
      type: 'techniques_refresh_complete',
      title: 'Trending techniques ready',
      body: `${data.editCount} edits + ${data.sfxCount} SFX extracted.`,
      priority: 'success',
      link: '/trending-techniques.html',
      meta: { durationMs: Date.now() - startTs, count: data.count },
    });
    res.json({ success: true, data });
  } catch (err) {
    pushNotification('_system', {
      type: 'techniques_refresh_failed',
      title: 'Trending techniques FAILED',
      body: err.message?.slice(0, 200),
      priority: 'error',
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
