/**
 * AssemblyAI — high-accuracy speech-to-text + audio intelligence.
 *
 * Pricing (April 2026): ~$0.37/hr for Best, $0.12/hr for Nano.
 * Free tier: $50 credit on signup.
 *
 * Setup: https://www.assemblyai.com → set ASSEMBLYAI_API_KEY
 *
 * Use case in our system: transcribe a client's TikTok / IG / YT videos →
 *   feed transcripts into brand-voice mining (richer signal than captions alone).
 */

const BASE = 'https://api.assemblyai.com/v2';

function getKey() {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new Error('ASSEMBLYAI_API_KEY not set');
  return k;
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      authorization: getKey(),
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs || 30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`AssemblyAI ${path} ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Submit a transcript job. Audio URL must be publicly accessible.
 * For TikTok/IG/YT video URLs, you may need to extract direct media URL first
 * (yt-dlp --get-url usually works).
 */
export async function submitTranscript(audioUrl, opts = {}) {
  return api('/transcript', {
    method: 'POST',
    body: {
      audio_url: audioUrl,
      speech_model: opts.model || 'best',         // 'best' | 'nano'
      language_code: opts.language || 'en',
      punctuate: true,
      format_text: true,
      // Audio intelligence add-ons (worth the small extra):
      sentiment_analysis: opts.sentiment ?? true,
      auto_highlights: opts.highlights ?? true,
      iab_categories: opts.categories ?? false,
      content_safety: opts.contentSafety ?? false,
    },
  });
}

export async function getTranscript(id) {
  return api(`/transcript/${id}`);
}

/**
 * Submit + poll until complete. Convenient one-shot.
 */
export async function transcribe(audioUrl, opts = {}) {
  const submission = await submitTranscript(audioUrl, opts);
  const id = submission.id;
  const maxWaitMs = opts.maxWaitMs || 10 * 60 * 1000; // 10 min
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 5000));
    const t = await getTranscript(id);
    if (t.status === 'completed') return t;
    if (t.status === 'error') throw new Error(`AssemblyAI: ${t.error}`);
  }
  throw new Error(`AssemblyAI timeout after ${maxWaitMs}ms (transcript ${id})`);
}

/**
 * Batch wrapper — transcribe multiple URLs sequentially (avoid overwhelming the API).
 * Returns { url, transcript, error } per input.
 */
export async function transcribeMany(audioUrls, opts = {}) {
  const out = [];
  for (const url of audioUrls) {
    try {
      const t = await transcribe(url, opts);
      out.push({
        url,
        text: t.text,
        sentiment: t.sentiment_analysis_results,
        highlights: t.auto_highlights_result?.results || [],
        confidence: t.confidence,
      });
    } catch (err) {
      out.push({ url, error: err.message });
    }
  }
  return out;
}
