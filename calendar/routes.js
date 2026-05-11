/**
 * Content calendar API routes
 * Mount at /api/calendar
 */

import { Router } from 'express';
import { buildCalendarView } from './aggregate.js';
import { generateCalendar, loadCalendar, saveCalendar } from './generate.js';
import { allFrameworks } from './frameworks.js';
import { pushNotification } from '../notifications/service.js';

const router = Router();

function safeId(id) { return /^[a-z0-9-]+$/i.test(String(id)); }
function safePlatform(p) {
  return ['instagram', 'tiktok', 'linkedin', 'facebook', 'all'].includes(p) ? p : null;
}

// GET /api/calendar/frameworks — static framework library
router.get('/frameworks', (_req, res) => {
  res.json(allFrameworks());
});

// GET /api/calendar/:clientId — aggregated calendar view
router.get('/:clientId', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const platform = safePlatform(req.query.platform) || null;
  try {
    const view = buildCalendarView(req.params.clientId, { platform: platform === 'all' ? null : platform });
    res.json({ success: true, data: view });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendar/:clientId/generate — AI-generated 4-week plan
router.post('/:clientId/generate', async (req, res) => {
  const clientId = req.params.clientId;
  if (!safeId(clientId)) return res.status(400).json({ error: 'bad id' });

  const platform = safePlatform(req.body?.platform) || 'all';
  const weeks = Math.min(parseInt(req.body?.weeks) || 4, 8);
  const startDate = req.body?.startDate;

  const startTs = Date.now();
  pushNotification(clientId, {
    type: 'calendar_generate_started',
    title: `Content calendar started — ${clientId}`,
    body: `Generating ${weeks}-week plan (${platform}). Typically 2-3 min.`,
    priority: 'info',
    link: `/calendar.html?client=${clientId}`,
  });

  try {
    const plan = await generateCalendar(clientId, { platform, weeks, startDate });
    const durationMs = Date.now() - startTs;

    pushNotification(clientId, {
      type: 'calendar_generate_complete',
      title: `Content calendar ready — ${clientId}`,
      body: `${plan.items?.length || 0} posts planned across ${weeks} weeks. ${(plan.batching_plan || []).length} batch filming days.`,
      priority: 'success',
      link: `/calendar.html?client=${clientId}`,
      meta: { durationMs, postCount: plan.items?.length, batches: plan.batching_plan?.length },
    });

    res.json({ success: true, data: plan });
  } catch (err) {
    pushNotification(clientId, {
      type: 'calendar_generate_failed',
      title: `Calendar generation FAILED — ${clientId}`,
      body: err.message?.slice(0, 180) || 'unknown error',
      priority: 'error',
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/calendar/:clientId/save — accept manual edits
router.post('/:clientId/save', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  try {
    saveCalendar(req.params.clientId, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/calendar/:clientId/plan — raw generated plan
router.get('/:clientId/plan', (req, res) => {
  if (!safeId(req.params.clientId)) return res.status(400).json({ error: 'bad id' });
  const plan = loadCalendar(req.params.clientId);
  if (!plan) return res.status(404).json({ success: false, error: 'No plan yet — generate first' });
  res.json({ success: true, data: plan });
});

export default router;
