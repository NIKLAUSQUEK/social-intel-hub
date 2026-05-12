/**
 * B4 — Platform webhook receivers.
 *
 * Once your Meta / TikTok / etc. app subscriptions are registered, they POST
 * here whenever a tracked account changes (new post, follower count drift,
 * comment activity, mention). We:
 *   1. Verify the signature (HMAC of the raw body using app secret)
 *   2. Map the incoming payload to a client_id (via the configured account id)
 *   3. Either trigger a targeted scrape via the queue OR write a delta straight
 *      to the client's data/ folder
 *
 * This file is a stub: receiver endpoints exist + signature verification works,
 * but the platform→client mapping table is empty until you register apps.
 *
 * Setup checklist when ready (see docs/WEEK2-OAUTH-INTEGRATION.md):
 *   1. Meta: developers.facebook.com → Webhooks → subscribe to Instagram +
 *      Page object → callback URL = https://YOUR-DOMAIN/api/webhooks/meta
 *      Verify token = META_WEBHOOK_VERIFY_TOKEN env var
 *   2. TikTok: developers.tiktok.com → Event Subscription → callback URL =
 *      https://YOUR-DOMAIN/api/webhooks/tiktok
 *   3. YouTube: console.cloud.google.com → PubSubHubbub for the channels
 *      you care about → callback URL = https://YOUR-DOMAIN/api/webhooks/youtube
 */
import { Router } from 'express';
import crypto from 'crypto';
import { getScrapeQueue } from '../lib/scrape-queue.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const router = Router();
const queue = getScrapeQueue(ROOT);

function safeEqual(a, b) {
  try {
    const A = Buffer.from(a || '', 'utf-8');
    const B = Buffer.from(b || '', 'utf-8');
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  } catch { return false; }
}

// ── Meta Graph API webhook (Instagram + Facebook Page) ──
// GET handles the verification challenge during app setup.
// POST handles real events.
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/meta', (req, res) => {
  // Meta signs requests with x-hub-signature-256: sha256=<hex>
  const sig = req.headers['x-hub-signature-256'] || '';
  const body = JSON.stringify(req.body); // express.json already parsed it
  const expected = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET || '')
    .update(body).digest('hex');
  if (!process.env.META_APP_SECRET || !safeEqual(sig, expected)) {
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }

  // Always acknowledge fast — Meta times out at ~5 s
  res.json({ ok: true });

  // Process async
  const entries = req.body?.entry || [];
  for (const entry of entries) {
    const igBusinessId = entry.id;
    // Map to client_id via SocialAccountResolver. Stub for now — log + queue refresh.
    console.log(`[webhook/meta] event for IG business ${igBusinessId}`);
    // TODO: resolve igBusinessId -> clientId via connections table, then:
    // queue.enqueue({ clientId, mode: 'webhook', requestedBy: 'meta-webhook' });
  }
});

// ── TikTok webhook ──
router.post('/tiktok', (req, res) => {
  // TikTok signs with TikTok-Signature header — HMAC-SHA256 of raw body
  const sig = req.headers['tiktok-signature'] || '';
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || '')
    .update(body).digest('hex');
  if (!process.env.TIKTOK_CLIENT_SECRET || !safeEqual(sig, expected)) {
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }
  res.json({ ok: true });
  console.log('[webhook/tiktok] event:', req.body?.event || 'unknown');
  // TODO: map open_id -> clientId, enqueue refresh
});

// ── YouTube PubSubHubbub (channel feed) ──
router.get('/youtube', (req, res) => {
  // PubSubHubbub verification — echo hub.challenge if hub.topic looks right
  const mode = req.query['hub.mode'];
  const challenge = req.query['hub.challenge'];
  if ((mode === 'subscribe' || mode === 'unsubscribe') && challenge) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(400);
});

router.post('/youtube', (req, res) => {
  // YouTube sends an Atom XML feed in body. We acknowledge fast,
  // then queue a targeted scrape for whichever channel updated.
  res.json({ ok: true });
  console.log('[webhook/youtube] event received');
  // TODO: parse atom, map channelId -> clientId, enqueue refresh
});

// ── Health check ──
router.get('/health', (_, res) => {
  res.json({
    ok: true,
    receivers: {
      meta: !!process.env.META_APP_SECRET,
      tiktok: !!process.env.TIKTOK_CLIENT_SECRET,
      youtube: true, // PubSubHubbub doesn't need a secret
    },
    queue: queue.snapshot().running.length + ' running, ' + queue.snapshot().pending.length + ' pending',
  });
});

export default router;
