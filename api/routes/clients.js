/**
 * Client API routes
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { clientIdGuard, safeError, generateId } from '../lib/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const router = Router();

// Apply clientId validation to all :id routes
router.param('id', clientIdGuard);

function getDataDir() {
  return join(ROOT, 'data');
}

function getClientsConfig() {
  const configPath = join(ROOT, 'clients.json');
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('[Config] Failed to read clients.json:', err.message);
    return { clients: [] };
  }
}

function readClientFile(clientId, filename) {
  const filePath = join(getDataDir(), clientId, filename);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[Data] Failed to parse ${clientId}/${filename}:`, err.message);
    return null;
  }
}

// GET /api/clients — list all clients
router.get('/', (req, res) => {
  try {
    const { clients } = getClientsConfig();

    // Enrich with latest scrape info
    const enriched = clients.map((client) => {
      const metrics = readClientFile(client.id, 'metrics-latest.json');
      return {
        ...client,
        lastScrapedAt: metrics?.scrapedAt || null,
        hasData: !!metrics,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/metrics — latest metrics for a client
router.get('/:id/metrics', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'metrics-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No metrics data found for this client' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/history — historical data for a client
router.get('/:id/history', (req, res) => {
  try {
    const scrapeHistory = readClientFile(req.params.id, 'history.json');
    const waybackHistory = readClientFile(req.params.id, 'wayback.json');

    if (!scrapeHistory && !waybackHistory) {
      return res.status(404).json({ success: false, error: 'No history data found for this client' });
    }

    res.json({
      success: true,
      data: {
        scrapeHistory: scrapeHistory?.snapshots || [],
        waybackHistory: waybackHistory?.history || {},
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/posts — top posts for a client
router.get('/:id/posts', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'posts-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No posts data found for this client' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/classifications — per-post identity (visual_style, content_type, hook_type, etc.)
router.get('/:id/classifications', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'classifications.json');
    if (!data) return res.json({ success: true, data: [] });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/scrape-health — A1/A6/A7 audit log
//   Returns last 30 attempts per platform + reliability % + last_success timestamp.
router.get('/:id/scrape-health', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'scrape-health.json');
    if (!data) {
      // No log yet (client never scraped under new code path) — return empty shape
      return res.json({ success: true, data: { perPlatform: {} } });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/post-tracker — individual post performance over time
router.get('/:id/post-tracker', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'post-tracker.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No post tracking data found' });
    }

    // Convert to array sorted by total engagement
    const posts = Object.entries(data).map(([id, post]) => {
      const latest = post.snapshots?.at(-1) || {};
      const totalEngagement = (latest.likes || 0) + (latest.comments || 0) +
        (latest.reactions || 0) + (latest.views || 0) + (latest.shares || 0);
      return { id, ...post, totalEngagement };
    });

    posts.sort((a, b) => b.totalEngagement - a.totalEngagement);

    res.json({ success: true, data: posts });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/report — weekly analysis report
router.get('/:id/report', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'report-latest.json');
    if (!data) {
      return res.status(404).json({ success: false, error: 'No report data found for this client' });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/tasks — structured tasks & strategy data
router.get('/:id/tasks', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'tasks.json');
    if (!data) {
      // Return default empty structure
      return res.json({
        success: true,
        data: {
          goals: [],
          strategy: [],
          filmingStyle: [],
          documents: [],
          actionables: [],
        },
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// PUT /api/clients/:id/tasks — save structured tasks & strategy data
router.put('/:id/tasks', (req, res) => {
  try {
    const clientId = req.params.id;
    const dir = join(getDataDir(), clientId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filePath = join(dir, 'tasks.json');
    const payload = {
      goals: req.body.goals || [],
      strategy: req.body.strategy || [],
      filmingStyle: req.body.filmingStyle || [],
      documents: req.body.documents || [],
      actionables: req.body.actionables || [],
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    res.json({ success: true, data: payload });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/markers — list markers for a client
router.get('/:id/markers', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'markers.json');
    res.json({ success: true, data: data || { markers: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// POST /api/clients/:id/markers — add a new marker
router.post('/:id/markers', (req, res) => {
  try {
    const clientId = req.params.id;
    const dir = join(getDataDir(), clientId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filePath = join(dir, 'markers.json');
    const existing = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, 'utf-8'))
      : { markers: [] };

    const marker = {
      id: generateId('m-'),
      date: req.body.date,
      text: req.body.text,
      type: req.body.type,
      createdAt: new Date().toISOString(),
    };
    existing.markers.push(marker);
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    res.json({ success: true, data: marker });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// DELETE /api/clients/:id/markers/:markerId — delete a marker
router.delete('/:id/markers/:markerId', (req, res) => {
  try {
    const clientId = req.params.id;
    const filePath = join(getDataDir(), clientId, 'markers.json');
    if (!existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'No markers found' });
    }
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const idx = data.markers.findIndex(m => m.id === req.params.markerId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Marker not found' });
    }
    data.markers.splice(idx, 1);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, data: { deleted: req.params.markerId } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/trends — get latest trend research (Exa-powered)
router.get('/:id/trends', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'trends-latest.json');
    res.json({ success: true, data: data || null });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/alerts — get latest competitor alerts
router.get('/:id/alerts', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'alerts-latest.json');
    res.json({ success: true, data: data || { alerts: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/screenshots — list available screenshots
router.get('/:id/screenshots', (req, res) => {
  try {
    const screenshotDir = join(getDataDir(), req.params.id, 'screenshots');
    if (!existsSync(screenshotDir)) {
      return res.json({ success: true, data: [] });
    }
    const files = readdirSync(screenshotDir)
      .filter(f => f.endsWith('.png'))
      .sort()
      .reverse()
      .map(f => {
        const parts = f.replace('.png', '').split('_');
        return { filename: f, platform: parts[0], date: parts[1], url: `/data/${req.params.id}/screenshots/${f}` };
      });
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/alerts/history — get alert history
router.get('/:id/alerts/history', (req, res) => {
  try {
    const data = readClientFile(req.params.id, 'alerts-history.json');
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

export default router;
