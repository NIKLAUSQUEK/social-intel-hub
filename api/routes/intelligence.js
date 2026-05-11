/**
 * Intelligence API routes
 * Endpoints for content classification, hook analysis, and AI opportunities.
 */

import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyPosts, loadClassifications, saveClassifications } from '../services/content-classifier.js';
import { computeContentTypePerformance, computeHookPerformance, computeHealthScore } from '../services/aggregator.js';
import { generateOpportunities } from '../services/opportunity-generator.js';
import { callLLM } from '../lib/llm-v2.js';
import { clientIdGuard, safeError } from '../lib/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const router = Router();

// Apply clientId validation
router.param('clientId', clientIdGuard);

function readClientFile(clientId, filename) {
  const filePath = join(ROOT, 'data', clientId, filename);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[INTEL] Failed to parse ${clientId}/${filename}:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════
// GET /api/intelligence/:clientId/overview
// Full intelligence overview: health, content perf, hooks, opportunities
// ═══════════════════════════════════════════════════
router.get('/:clientId/overview', (req, res) => {
  try {
    const { clientId } = req.params;
    const classifications = loadClassifications(clientId);
    const posts = readClientFile(clientId, 'posts-latest.json');
    const allPosts = posts?.platforms
      ? Object.entries(posts.platforms).flatMap(([platform, pp]) => pp.map(p => ({ ...p, platform })))
      : [];

    const contentPerf = computeContentTypePerformance(classifications, allPosts);
    const hookPerf = computeHookPerformance(classifications, allPosts);
    const healthScore = computeHealthScore(clientId);
    const opportunities = generateOpportunities(contentPerf, hookPerf, classifications, healthScore);

    res.json({
      success: true,
      data: {
        healthScore,
        contentPerformance: contentPerf,
        hookPerformance: hookPerf,
        opportunities,
        classificationCount: classifications.length,
        lastClassified: classifications.length > 0
          ? classifications[classifications.length - 1]?.created_at || null
          : null,
      },
    });
  } catch (err) {
    console.error('[INTEL] Overview error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// ═══════════════════════════════════════════════════
// POST /api/intelligence/:clientId/classify
// Run AI classification on all posts (or re-classify)
// ═══════════════════════════════════════════════════
router.post('/:clientId/classify', async (req, res) => {
  try {
    const { clientId } = req.params;
    const posts = readClientFile(clientId, 'posts-latest.json');
    if (!posts?.platforms) {
      return res.status(400).json({ success: false, error: 'No posts data found' });
    }

    const allPosts = Object.entries(posts.platforms)
      .flatMap(([platform, pp]) => pp.map(p => ({ ...p, platform })));

    if (allPosts.length === 0) {
      return res.status(400).json({ success: false, error: 'No posts to classify' });
    }

    console.log(`[INTEL] Classifying ${allPosts.length} posts for ${clientId}...`);
    const classifications = await classifyPosts(callLLM, allPosts);

    // Add timestamps
    const now = new Date().toISOString();
    for (const c of classifications) {
      c.created_at = now;
      c.client_id = clientId;
    }

    saveClassifications(clientId, classifications);

    res.json({
      success: true,
      data: {
        classified: classifications.length,
        classifications,
      },
    });
  } catch (err) {
    console.error('[INTEL] Classification error:', err);
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// ═══════════════════════════════════════════════════
// GET /api/intelligence/:clientId/hooks
// Hook performance analysis
// ═══════════════════════════════════════════════════
router.get('/:clientId/hooks', (req, res) => {
  try {
    const { clientId } = req.params;
    const classifications = loadClassifications(clientId);
    const posts = readClientFile(clientId, 'posts-latest.json');
    const allPosts = posts?.platforms
      ? Object.entries(posts.platforms).flatMap(([platform, pp]) => pp.map(p => ({ ...p, platform })))
      : [];

    const hookPerf = computeHookPerformance(classifications, allPosts);

    res.json({
      success: true,
      data: hookPerf,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

// ═══════════════════════════════════════════════════
// GET /api/intelligence/:clientId/opportunities
// AI-generated opportunities
// ═══════════════════════════════════════════════════
router.get('/:clientId/opportunities', (req, res) => {
  try {
    const { clientId } = req.params;
    const classifications = loadClassifications(clientId);
    const posts = readClientFile(clientId, 'posts-latest.json');
    const allPosts = posts?.platforms
      ? Object.entries(posts.platforms).flatMap(([platform, pp]) => pp.map(p => ({ ...p, platform })))
      : [];

    const contentPerf = computeContentTypePerformance(classifications, allPosts);
    const hookPerf = computeHookPerformance(classifications, allPosts);
    const healthScore = computeHealthScore(clientId);
    const opportunities = generateOpportunities(contentPerf, hookPerf, classifications, healthScore);

    res.json({
      success: true,
      data: opportunities,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: safeError(err) });
  }
});

export default router;
