/**
 * Express router for comment-intel data.
 * Mount at /api/audience in your server.
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

const router = Router();

// Validate clientId against path traversal
function safeId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/i.test(id);
}

router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  const file = join(DATA_DIR, req.params.clientId, 'comment-intel.json');
  if (!existsSync(file)) {
    return res.status(404).json({ error: 'No comment intel — run node comments/run.js first' });
  }
  try {
    const json = JSON.parse(readFileSync(file, 'utf-8'));
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read intel' });
  }
});

// Summary across all clients — for an overview dashboard
router.get('/', (req, res) => {
  const clientsFile = join(__dirname, '..', 'clients.json');
  if (!existsSync(clientsFile)) return res.json({ clients: [] });
  const { clients } = JSON.parse(readFileSync(clientsFile, 'utf-8'));

  const summary = [];
  for (const c of clients) {
    if (!c.active) continue;
    const file = join(DATA_DIR, c.id, 'comment-intel.json');
    if (!existsSync(file)) continue;
    try {
      const d = JSON.parse(readFileSync(file, 'utf-8'));
      summary.push({
        id: c.id,
        name: c.name,
        commentCount: d.commentCount,
        sentiment: d.sentiment,
        contentIdeasCount: d.contentIdeas?.length || 0,
        hateCount: d.hateComments?.length || 0,
        fanRequestCount: d.fanRequests?.length || 0,
        generatedAt: d.generatedAt,
      });
    } catch { /* skip */ }
  }
  res.json({ clients: summary });
});

export default router;
