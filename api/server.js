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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Dashboard scrape trigger ──
// Same scraper invocation as the Make.com webhook, but auth-gated by either
// localhost origin OR a session cookie. No external secret needed — agency
// users running locally can fire scrapes from the UI button.
// Job state persisted to memory so the dashboard can poll status.
const _scrapeJobs = new Map(); // jobId -> { status, startedAt, finishedAt, clientId, stdout, stderr, error }

function isLocalRequest(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
}

app.post('/api/scrape/run', (req, res) => {
  if (!isLocalRequest(req) && req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden — local-only or INTERNAL_API_KEY required' });
  }
  const clientId = req.body?.clientId;
  if (clientId && !validateClientId(clientId)) {
    return res.status(400).json({ success: false, error: 'Invalid client ID' });
  }
  const ROOT = join(__dirname, '..');
  const jobId = 'scrape-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const job = { jobId, status: 'running', startedAt: new Date().toISOString(), clientId: clientId || null, stdout: '', stderr: '' };
  _scrapeJobs.set(jobId, job);

  const args = ['scraper/index.js'];
  if (clientId) args.push('--client', clientId);
  console.log(`[Dashboard scrape] Job ${jobId} started for ${clientId || 'ALL'}`);

  const child = execFile('node', args, { cwd: ROOT, timeout: 900000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    job.stdout = stdout?.slice(-4000) || '';
    job.stderr = stderr?.slice(-4000) || '';
    job.finishedAt = new Date().toISOString();
    job.status = err ? 'failed' : 'success';
    if (err) job.error = err.message?.slice(0, 300);
    console.log(`[Dashboard scrape] Job ${jobId} ${job.status}`);
  });

  // Stream incremental stdout (so the UI can show progress)
  if (child.stdout) child.stdout.on('data', d => { job.stdout = (job.stdout + d.toString()).slice(-4000); });
  if (child.stderr) child.stderr.on('data', d => { job.stderr = (job.stderr + d.toString()).slice(-4000); });

  res.json({ success: true, data: { jobId, message: `Scrape queued for ${clientId || 'all clients'}` } });
});

// GET status of a scrape job
app.get('/api/scrape/status/:jobId', (req, res) => {
  if (!isLocalRequest(req) && req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const job = _scrapeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, data: job });
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

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
