/**
 * Lead-gen API — mount at /api/leads
 *
 *   POST /campaigns            { keywords, location, sources, limit, enrich, requireContact } → { id }
 *   GET  /campaigns            list (no lead bodies)
 *   GET  /campaigns/:id        full campaign incl. leads + groups + log
 *   GET  /campaigns/:id/export.csv
 *   GET  /sources              available source ids + which env keys they need
 *   POST /suppress             { value, reason } — opt-out an email, @domain or URL
 */

import { Router } from 'express';
import {
  createCampaign, executeCampaign, getCampaign, listCampaigns, SOURCES, DEFAULT_SOURCES, addSuppression,
} from './index.js';
import { leadsToCsv } from './lead.js';
import dmRoutes from './messenger/routes.js';

const router = Router();

router.use('/dm', dmRoutes);

const SEARCH_KEYS = ['BRAVE_SEARCH_API_KEY', 'TAVILY_API_KEY', 'EXA_API_KEY'];
const NEEDS = {
  'google-maps': ['GOOGLE_PLACES_API_KEY'],
  'youtube-api': ['YOUTUBE_API_KEY'],
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
};

router.get('/sources', (req, res) => {
  const anySearch = SEARCH_KEYS.some(k => process.env[k]);
  res.json({
    success: true,
    data: Object.keys(SOURCES).map(id => {
      const needs = NEEDS[id] || SEARCH_KEYS;
      const ready = NEEDS[id] ? needs.every(k => process.env[k]) : anySearch;
      return { id, ready, needs: NEEDS[id] ? needs : ['one of ' + SEARCH_KEYS.join(' / ')], default: DEFAULT_SOURCES.includes(id) };
    }),
  });
});

router.post('/campaigns', (req, res) => {
  let c;
  try {
    const b = req.body || {};
    c = createCampaign({
      keywords: b.keywords,
      location: String(b.location || '').slice(0, 120),
      sources: Array.isArray(b.sources) && b.sources.length ? b.sources : DEFAULT_SOURCES,
      limit: Number(b.limit) || 100,
      perQuery: Number(b.perQuery) || 20,
      enrich: b.enrich !== false,
      requireContact: b.requireContact !== false,
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  // Runs in the background; poll GET /campaigns/:id
  executeCampaign(c).catch(err => console.error('[leads] campaign failed:', err.message));
  res.status(202).json({ success: true, data: { id: c.id, status: c.status } });
});

router.get('/campaigns', (req, res) => {
  res.json({ success: true, data: listCampaigns() });
});

router.get('/campaigns/:id', (req, res) => {
  const c = getCampaign(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
  res.json({ success: true, data: c });
});

router.get('/campaigns/:id/export.csv', (req, res) => {
  const c = getCampaign(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });
  const min = Number(req.query.minScore) || 0;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${c.id.slice(0, 8)}.csv"`);
  res.send(leadsToCsv(c.leads.filter(l => l.score >= min)));
});

router.post('/suppress', (req, res) => {
  const value = req.body?.value;
  if (!value) return res.status(400).json({ success: false, error: 'value required' });
  addSuppression(value, req.body?.reason);
  res.json({ success: true });
});

export default router;
