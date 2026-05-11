/**
 * Trending audio API
 * Mount at /api/trending-audio
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { refreshTrendingAudio, getTrendingAudio, filterForClient } from './fetch.js';
import { pushNotification } from '../notifications/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const router = Router();

function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }

// GET /api/trending-audio — latest cached list
router.get('/', (_req, res) => {
  const data = getTrendingAudio();
  if (!data) return res.status(404).json({ success: false, error: 'No data yet. POST /refresh to generate.' });
  res.json({ success: true, data });
});

// GET /api/trending-audio/for/:clientId — filtered by client niche
router.get('/for/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const data = getTrendingAudio();
  if (!data) return res.status(404).json({ success: false, error: 'No trending audio yet.' });

  const clients = JSON.parse(readFileSync(join(ROOT, 'clients.json'), 'utf-8')).clients;
  const client = clients.find(c => c.id === req.params.clientId);
  if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

  const filtered = filterForClient(data.tracks, client);
  res.json({
    success: true,
    data: {
      ...data,
      tracks: filtered,
      filteredForClient: req.params.clientId,
    },
  });
});

// POST /api/trending-audio/refresh — re-run Exa + LLM pipeline
router.post('/refresh', async (_req, res) => {
  const startTs = Date.now();
  pushNotification('_system', {
    type: 'trending_audio_refresh_started',
    title: 'Trending audio refresh started',
    body: 'Scanning web for latest viral TikTok sounds. Takes 30-60s.',
    priority: 'info',
    link: '/trending-audio.html',
  });

  try {
    const data = await refreshTrendingAudio();
    const durationMs = Date.now() - startTs;

    pushNotification('_system', {
      type: 'trending_audio_refresh_complete',
      title: 'Trending audio refresh ready',
      body: `${data.trackCount} tracks from ${data.sourceCount} articles.`,
      priority: 'success',
      link: '/trending-audio.html',
      meta: { durationMs, trackCount: data.trackCount },
    });

    res.json({ success: true, data });
  } catch (err) {
    pushNotification('_system', {
      type: 'trending_audio_refresh_failed',
      title: 'Trending audio refresh FAILED',
      body: err.message?.slice(0, 200) || 'unknown error',
      priority: 'error',
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
