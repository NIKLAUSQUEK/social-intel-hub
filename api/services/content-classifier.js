/**
 * Content Classifier Service
 * Sends posts to LLM for classification: content type, hook type, sentiment, etc.
 * Processes in batches of 3 with 1s delay between batches.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// Predefined enums for consistent classification
const CONTENT_TYPES = [
  'educational', 'tutorial', 'how-to', 'listicle', 'opinion', 'reaction',
  'story-time', 'day-in-life', 'behind-scenes', 'interview', 'debate',
  'news-commentary', 'motivational', 'challenge', 'trend-hop', 'duet-stitch',
  'product-review', 'comparison', 'transformation', 'announcement', 'Q&A',
  'poll-question', 'carousel', 'infographic', 'meme-humour',
];

const HOOK_TYPES = [
  'question', 'bold-claim', 'statistic', 'controversy', 'story-open',
  'pain-point', 'curiosity-gap', 'social-proof', 'direct-address',
  'pattern-interrupt', 'before-after', 'myth-bust', 'time-urgency', 'visual-hook',
];

function buildClassificationPrompt(posts) {
  return `You are a social media content analyst. Classify each post below.

For each post, return a JSON object with these fields:
- post_id: the post URL or ID
- content_type: one of [${CONTENT_TYPES.join(', ')}]
- hook_type: one of [${HOOK_TYPES.join(', ')}]
- sentiment_score: 0-100 (0=very negative, 50=neutral, 100=very positive)
- sentiment_label: "positive", "neutral", or "negative"
- emotional_triggers: array of emotions evoked (e.g. ["curiosity", "outrage", "hope"])
- visual_style: brief description of visual approach (e.g. "talking head", "text overlay", "b-roll montage")
- cta_type: "none", "soft", "medium", "hard"
- cta_strength: brief description of call-to-action if present
- estimated_retention_pct: estimated % of viewers who watch >50% (0-100)

Return ONLY a JSON array of objects. No markdown, no explanation.

Posts to classify:
${posts.map((p, i) => `[${i + 1}] URL: ${p.url || p.post_id || 'unknown'}
Caption: ${(p.caption || '').slice(0, 300)}
Platform: ${p.platform || 'unknown'}
Type: ${p.postType || 'unknown'}
Likes: ${p.likes || 0} | Comments: ${p.comments || 0} | Views: ${p.views || 0}
`).join('\n')}`;
}

/**
 * Classify posts using LLM
 * @param {Function} callLLM - The LLM caller function (Gemini→OpenAI→Azure fallback)
 * @param {Array} posts - Array of post objects with url, caption, platform, likes, etc.
 * @returns {Array} Classification results
 */
export async function classifyPosts(callLLM, posts) {
  if (!posts || posts.length === 0) return [];

  const results = [];
  const batchSize = 3;

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    try {
      const prompt = buildClassificationPrompt(batch);
      // Route through cheap tier (DeepSeek-first) — label triggers /classify/ regex.
      const raw = await callLLM(prompt, 'classify-posts', { tier: 'cheap', maxTokens: 2000 });

      // Parse JSON from LLM response (handle markdown code blocks)
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else {
        results.push(parsed);
      }
    } catch (err) {
      console.log(`  [CLASSIFY] Batch ${Math.floor(i / batchSize) + 1} failed: ${err.message}`);
      // Push placeholder results for failed batch
      for (const post of batch) {
        results.push({
          post_id: post.url || post.post_id || 'unknown',
          content_type: 'unknown',
          hook_type: 'unknown',
          sentiment_score: 50,
          sentiment_label: 'neutral',
          error: err.message,
        });
      }
    }

    // Delay between batches
    if (i + batchSize < posts.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return results;
}

/**
 * Load existing classifications from disk cache
 */
export function loadClassifications(clientId) {
  const filePath = join(ROOT, 'data', clientId, 'classifications.json');
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  return [];
}

/**
 * Save classifications to disk cache
 */
export function saveClassifications(clientId, classifications) {
  const filePath = join(ROOT, 'data', clientId, 'classifications.json');
  writeFileSync(filePath, JSON.stringify(classifications, null, 2));
}

export { CONTENT_TYPES, HOOK_TYPES };
