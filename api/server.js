/**
 * Social Intel API Server
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { validateClientId } from './lib/security.js';
import clientRoutes from './routes/clients.js';
import analyseRoutes from './routes/analyse.js';
import intelligenceRoutes from './routes/intelligence.js';
import notificationsRoutes from '../notifications/routes.js';
import calendarRoutes from '../calendar/routes.js';
import trendingAudioRoutes from '../trending-audio/routes.js';
import competitorDiscoveryRoutes from '../competitor-discovery/routes.js';
import trendingTechniquesRoutes from '../trending-techniques/routes.js';
import metricsRoutes from '../metrics/routes.js';
import trendJackingRoutes from '../trend-jacking/routes.js';
import influenceRoutes from '../influence-network/routes.js';
import contentPerfRoutes from '../content-performance/routes.js';
import responsePriorityRoutes from '../response-priority/routes.js';
import webhooksRoutes from './routes/webhooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3099;

// CORS — restrict in production
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3099', 'http://127.0.0.1:3099'];
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
}));
app.use(express.json({ limit: '1mb' }));

// Serve dashboard static files
app.use(express.static(join(__dirname, '..', 'dashboard')));

// Serve presentation deck at /pitch (or /pitch/)
app.use('/pitch', express.static(join(__dirname, '..', 'presentation')));

// Serve ONLY screenshot files — not the entire data directory
app.use('/data/:clientId/screenshots', (req, res, next) => {
  if (!validateClientId(req.params.clientId)) {
    return res.status(400).json({ success: false, error: 'Invalid client ID' });
  }
  express.static(join(__dirname, '..', 'data', req.params.clientId, 'screenshots'))(req, res, next);
});

// Routes
app.use('/api/clients', clientRoutes);
app.use('/api/analyse', analyseRoutes);
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/trending-audio', trendingAudioRoutes);
app.use('/api/competitor-discovery', competitorDiscoveryRoutes);
app.use('/api/trending-techniques', trendingTechniquesRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/trend-jacking', trendJackingRoutes);
app.use('/api/influence', influenceRoutes);
app.use('/api/content-performance', contentPerfRoutes);
app.use('/api/response-priority', responsePriorityRoutes);
app.use('/api/webhooks', webhooksRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Dashboard scrape trigger ──
// Now backed by a proper queue with concurrency limit + retry/backoff.
import { getScrapeQueue } from './lib/scrape-queue.js';
const _scrapeQueue = getScrapeQueue(join(__dirname, '..'));

function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
}

app.post('/api/scrape/run', (req, res) => {
  if (!isLocalRequest(req) && req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden — local-only or INTERNAL_API_KEY required' });
  }
  const clientId = req.body?.clientId;
  const mode = req.body?.mode;
  if (clientId && !validateClientId(clientId)) {
    return res.status(400).json({ success: false, error: 'Invalid client ID' });
  }
  const job = _scrapeQueue.enqueue({
    clientId, mode,
    requestedBy: isLocalRequest(req) ? 'dashboard' : 'webhook',
  });
  res.json({ success: true, data: { jobId: job.jobId, message: `Scrape queued for ${clientId || 'all clients'}` } });
});

// GET status of a scrape job
app.get('/api/scrape/status/:jobId', (req, res) => {
  if (!isLocalRequest(req) && req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const job = _scrapeQueue.status(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, data: job });
});

// GET queue snapshot — pending, running, dead-letter (B1 ops visibility)
app.get('/api/scrape/queue', (req, res) => {
  if (!isLocalRequest(req) && req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  res.json({ success: true, data: _scrapeQueue.snapshot() });
});

// Webhook endpoint — triggered by Make.com to run scraper
app.post('/api/webhook/scrape', (req, res) => {
  const { clientId, secret } = req.body;
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error('[Webhook] WEBHOOK_SECRET not configured — refusing all webhook requests');
    return res.status(503).json({ success: false, error: 'Webhook not configured' });
  }

  if (secret !== expectedSecret) {
    return res.status(403).json({ success: false, error: 'Invalid secret' });
  }

  // Validate clientId to prevent command injection
  if (clientId && !validateClientId(clientId)) {
    return res.status(400).json({ success: false, error: 'Invalid client ID' });
  }

  const ROOT = join(__dirname, '..');

  console.log(`[Webhook] Scrape triggered for: ${clientId || 'ALL clients'}`);
  res.json({ success: true, message: `Scrape started for ${clientId || 'all clients'}`, timestamp: new Date().toISOString() });

  // Use execFile with argument array — no shell interpolation
  const args = ['scraper/index.js'];
  if (clientId) {
    args.push('--client', clientId);
  }

  execFile('node', args, { cwd: ROOT, timeout: 600000 }, (err, stdout, stderr) => {
    if (err) {
      console.error(`[Webhook] Scrape failed:`, err.message);
      if (stderr) console.error(stderr);
    } else {
      console.log(`[Webhook] Scrape complete:\n${stdout}`);
    }
  });
});

// Global error handler — never expose internal details
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

const server = app.listen(PORT, () => {
  console.log(`Social Intel API running on http://localhost:${PORT}`);
});

// ── A8 + scheduler: register recurring tasks ──
// Wayback weekly archive (every active client) + niche baselines daily refresh.
(async () => {
  if (process.env.VERCEL) return;
  try {
    const { registerTask, startScheduler } = await import('./lib/scheduler.js');

    registerTask('wayback-weekly-archive', 7 * 24 * 3600 * 1000, async () => {
      console.log('[scheduler] wayback-weekly-archive starting');
      const { readFileSync } = await import('fs');
      const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'clients.json'), 'utf-8'));
      for (const c of cfg.clients || []) {
        if (!c.active) continue;
        try {
          await fetch(`http://localhost:${PORT}/api/analyse/${c.id}/wayback/archive`, { method: 'POST' });
          await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
          console.error(`[scheduler] wayback for ${c.id} failed:`, err.message?.slice(0, 100));
        }
      }
      console.log('[scheduler] wayback-weekly-archive complete');
    });

    registerTask('niche-baselines-refresh', 24 * 3600 * 1000, async () => {
      const { computeNicheBaselines } = await import('./lib/niche-baselines.js');
      computeNicheBaselines({ force: true });
      console.log('[scheduler] niche-baselines-refresh complete');
    });

    startScheduler();
  } catch (err) {
    console.error('[scheduler] failed to start:', err.message);
  }
})();

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
