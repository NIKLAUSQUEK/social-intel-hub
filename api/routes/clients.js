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

// GET /api/clients/freshness/all — A15 portfolio-wide scrape freshness audit
// Returns every client's last successful scrape per platform, flags any that
// have missed their SLA (default 7 days; override per client via clients.json `scrapeCadenceDays`).
router.get('/freshness/all', (req, res) => {
  try {
    const clientsCfg = JSON.parse(readFileSync(join(ROOT, 'clients.json'), 'utf-8'));
    const out = [];
    const now = Date.now();
    for (const c of clientsCfg.clients || []) {
      if (!c.active) continue;
      const sla = c.scrapeCadenceDays || 7;
      const health = readClientFile(c.id, 'scrape-health.json');
      const metrics = readClientFile(c.id, 'metrics-latest.json');
      const lastScrapedTs = metrics?.scrapedAt ? new Date(metrics.scrapedAt).getTime() : null;
      const ageDays = lastScrapedTs ? Math.round((now - lastScrapedTs) / 86400000) : null;
      const perPlatform = {};
      let worstAgeDays = ageDays;
      if (health?.perPlatform) {
        for (const [pf, data] of Object.entries(health.perPlatform)) {
          const lastSuc = data.last_success ? new Date(data.last_success).getTime() : null;
          const pAge = lastSuc ? Math.round((now - lastSuc) / 86400000) : null;
          perPlatform[pf] = {
            last_success: data.last_success,
            ageDays: pAge,
            status: data.last_status,
            reliability_30d_pct: data.reliability_30d_pct,
          };
          if (pAge != null && (worstAgeDays == null || pAge > worstAgeDays)) worstAgeDays = pAge;
        }
      }
      const slaStatus = worstAgeDays == null
        ? 'unknown'
        : (worstAgeDays > sla * 2) ? 'critical'
        : (worstAgeDays > sla) ? 'breach'
        : (worstAgeDays > sla * 0.7) ? 'warn'
        : 'healthy';
      out.push({
        id: c.id, name: c.name, slaDays: sla,
        ageDays: worstAgeDays,
        slaStatus,
        perPlatform,
      });
    }
    out.sort((a, b) => {
      const rank = s => ({ critical: 0, breach: 1, warn: 2, unknown: 3, healthy: 4 }[s] ?? 99);
      return rank(a.slaStatus) - rank(b.slaStatus);
    });
    res.json({ success: true, data: { generated_at: new Date().toISOString(), clients: out } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/entities — A14 entity → clients grouping for roll-up dashboards
router.get('/entities/list', (req, res) => {
  try {
    const entitiesPath = join(ROOT, 'entities.json');
    if (!existsSync(entitiesPath)) return res.json({ success: true, data: { entities: [] } });
    const ent = JSON.parse(readFileSync(entitiesPath, 'utf-8'));
    // Resolve client metadata for each entity
    const clientsCfg = readClientFile('', 'clients.json') || JSON.parse(readFileSync(join(ROOT, 'clients.json'), 'utf-8'));
    const byId = Object.fromEntries((clientsCfg.clients || []).map(c => [c.id, c]));
    const resolved = (ent.entities || []).map(e => ({
      ...e,
      clients: (e.clients || []).map(cid => {
        const c = byId[cid];
        if (!c) return { id: cid, missing: true };
        // Pull current followers across platforms
        const metrics = readClientFile(cid, 'metrics-latest.json');
        let totalFollowers = 0;
        if (metrics?.platforms) {
          for (const data of Object.values(metrics.platforms)) {
            totalFollowers += (data?.followers || data?.pageLikes || 0);
          }
        }
        return { id: cid, name: c.name, niche: c.niche, totalFollowers, active: c.active };
      }),
    }));
    res.json({ success: true, data: { entities: resolved } });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// GET /api/clients/:id/content-clusters — A11 cross-platform content clusters
router.get('/:id/content-clusters', (req, res) => {
  try {
    const posts = readClientFile(req.params.id, 'posts-latest.json');
    if (!posts?.platforms) return res.json({ success: true, data: { clusters: [] } });
    // Lazy import to avoid loading on every request startup
    import('../lib/content-clusters.js').then(({ detectContentClusters }) => {
      const clusters = detectContentClusters(posts.platforms);
      res.json({ success: true, data: { clusters } });
    }).catch(err => {
      res.status(500).json({ success: false, error: safeError(err) });
    });
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
