/**
 * Competitor discovery — Option C (Exa + LLM hybrid)
 *
 * Pipeline:
 *   1. Pull client info from clients.json (name, niche, platforms, pillars, geography)
 *   2. Pull a few of their best captions to understand positioning
 *   3. Multi-pronged Exa search:
 *        - "top [niche] creators on [platform] [geography]"
 *        - "[client name] competitors / similar accounts"
 *        - "best [niche] influencers [year] like [client]"
 *   4. LLM ranks + structures into { name, rationale, platforms{ig,tiktok,linkedin}, threatLevel, similarity }
 *   5. Filter to only entries with at least one verified handle
 *   6. Return as suggestions array — caller decides which to save to clients.json
 *
 * Suggestions written to data/{clientId}/competitor-suggestions.json
 * (separate from clients.json — only on user approval do they get promoted)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from '../api/lib/llm-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');

// ── Exa ────────────────────────────────────────────

async function exaSearch(query, opts = {}) {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error('EXA_API_KEY not set');
  const body = {
    query,
    type: opts.type || 'auto',
    numResults: opts.numResults || 8,
    contents: { text: { maxCharacters: opts.maxChars || 3000 } },
  };
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}`);
  return res.json();
}

// ── Build query set per client ─────────────────────

function buildQueries(client, inferredNiche, geography) {
  const name = client.name;
  const niche = client.niche || inferredNiche || '';
  const year = new Date().getFullYear();
  const geoTag = geography && geography !== 'Global' ? geography : '';

  // Detect content-topic geography from niche phrase (e.g. "UK property" when creator is SG-based)
  // This gives us a second angle — competitors who target the same market as the client
  const topicGeoMatch = niche.match(/\b(UK|United Kingdom|US|USA|United States|Singapore|SG|Malaysia|Australia|Canada|Europe|Japan|India|UAE)\b/i);
  const topicGeo = topicGeoMatch ? topicGeoMatch[1] : '';
  const hasDualGeo = topicGeo && geoTag && topicGeo.toLowerCase() !== geoTag.toLowerCase();

  if (!niche) {
    return [
      { bucket: 'general', q: `${name} competitors similar creators` },
      { bucket: 'general', q: `creators like ${name}` },
    ];
  }

  const queries = [
    // Global niche leaders (topic-country competitors)
    { bucket: 'global', q: `top ${niche} creators ${year}` },
    { bucket: 'global', q: `best ${niche} influencers worldwide ${year}` },
  ];

  if (geoTag) {
    // Local rivals bound to where the creator is physically based — they fight for the same audience
    queries.push(
      { bucket: 'local', q: `${geoTag} ${niche} creators influencers ${year}` },
      { bucket: 'local', q: `top ${niche} mentors coaches in ${geoTag}` },
      { bucket: 'local', q: `${geoTag} based property investment influencer ${year}` },
    );
  }

  // Dual-geo special case: creator base ≠ content topic country
  // e.g. SG-based creator selling UK property → also query SG property creators broadly
  if (hasDualGeo) {
    queries.push(
      { bucket: 'local', q: `${geoTag} property investment coaches mentors ${year}` },
      { bucket: 'local', q: `${geoTag} real estate education creators ${year}` },
    );
  }

  queries.push(
    { bucket: 'adjacent', q: `${name} similar to who ${niche} ${geoTag}` },
  );

  return queries;
}

// Detect primary geography from client data — explicit field, username hints, or niche
async function inferClientGeography(client, clientId) {
  // 1. Explicit field
  if (client.geography) return client.geography;
  if (client.country)   return client.country;

  // 2. Existing competitor hints
  const compHints = (client.competitors || []).map(c => c.party || c.category || '').join(' ').toLowerCase();
  if (/pap|wp|psp|singapore|\bsg\b/.test(compHints)) return 'Singapore';
  if (/\buk\b|britain|england/.test(compHints)) return 'United Kingdom';

  // 3. Ask LLM based on captions + bio
  const signals = [];
  for (const [plat, cfg] of Object.entries(client.platforms || {})) {
    if (cfg.username) signals.push(`${plat}: ${cfg.username}`);
  }
  const postsFile = join(DATA_DIR, clientId, 'posts-latest.json');
  if (existsSync(postsFile)) {
    try {
      const posts = JSON.parse(readFileSync(postsFile, 'utf-8'));
      const platforms = posts.platforms || posts;
      let blob = '';
      for (const list of Object.values(platforms)) {
        const arr = Array.isArray(list) ? list : (list?.posts || []);
        for (const p of arr.slice(0, 6)) {
          if (p.caption) blob += p.caption.slice(0, 160) + ' | ';
        }
      }
      if (blob) signals.push(`Captions: ${blob.slice(0, 700)}`);
    } catch {}
  }
  const metricsFile = join(DATA_DIR, clientId, 'metrics-latest.json');
  if (existsSync(metricsFile)) {
    try {
      const m = JSON.parse(readFileSync(metricsFile, 'utf-8'));
      const plats = m.platforms || m;
      for (const p of Object.values(plats)) {
        if (p.bio) signals.push(`Bio: ${p.bio}`);
      }
    } catch {}
  }

  if (!signals.length) return 'Global';

  try {
    const raw = await callLLM(
      `Signals:\n${signals.join('\n')}

Where is this creator PHYSICALLY BASED — i.e. where do they live and operate from?
Not the country their content is *about* (e.g. a Singaporean influencer selling UK property is BASED in Singapore, even though content covers UK).

Look for signals like:
- Singlish / Malay / Chinese in captions → Singapore or Malaysia base
- "£" + British spelling → UK base
- "$" + American spelling → US base
- Business registration hints, city tags
- Bilingual content → usually base country is the Asian one, not the Western one they target

Return ONLY the country or city name. If genuinely unclear, return "Global". No explanation.`,
      'geo-infer',
      { maxTokens: 30, tier: 'premium', model: 'claude-sonnet-4-20250514' },
    );
    const geo = raw.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    return geo.length < 60 ? geo : 'Global';
  } catch {
    return 'Global';
  }
}

// Infer client's niche from their scraped content + platform usernames
async function inferClientNiche(client, clientId) {
  // Collect signals
  const signals = [];

  // 1. Platform usernames (often most descriptive)
  for (const [plat, cfg] of Object.entries(client.platforms || {})) {
    if (cfg.username) signals.push(`${plat}: ${cfg.username}`);
  }

  // 2. Bio + captions from scraped data
  const postsFile = join(DATA_DIR, clientId, 'posts-latest.json');
  if (existsSync(postsFile)) {
    try {
      const posts = JSON.parse(readFileSync(postsFile, 'utf-8'));
      const platforms = posts.platforms || posts;
      let captionBlob = '';
      for (const list of Object.values(platforms)) {
        const arr = Array.isArray(list) ? list : (list?.posts || []);
        for (const p of arr.slice(0, 8)) {
          if (p.caption) captionBlob += p.caption.slice(0, 180) + ' | ';
        }
      }
      if (captionBlob) signals.push(`Recent captions: ${captionBlob.slice(0, 800)}`);
    } catch { /* skip */ }
  }

  // 3. Metrics for bio
  const metricsFile = join(DATA_DIR, clientId, 'metrics-latest.json');
  if (existsSync(metricsFile)) {
    try {
      const m = JSON.parse(readFileSync(metricsFile, 'utf-8'));
      const platforms = m.platforms || m;
      for (const p of Object.values(platforms)) {
        if (p.bio) signals.push(`Bio: ${p.bio}`);
        if (p.displayName) signals.push(`Display: ${p.displayName}`);
      }
    } catch { /* skip */ }
  }

  if (!signals.length) return null;

  const prompt = `Based on these signals, describe this creator's niche in a SHORT phrase (3-8 words).
Focus on their industry/topic/audience — e.g. "UK property investment education", "Singapore political commentary", "home workout fitness", "B2B SaaS growth", "indie fashion brand".

Signals:
${signals.join('\n')}

Return ONLY the niche phrase. No preamble, no quotes.`;

  try {
    const raw = await callLLM(prompt, 'niche-infer', {
      maxTokens: 60,
      tier: 'premium',
      model: 'claude-sonnet-4-20250514',
    });
    const niche = raw.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    return niche.length < 100 ? niche : null;
  } catch {
    return null;
  }
}

// ── Pull a few caption samples for context ────────

function getClientPositioningContext(clientId) {
  const file = join(DATA_DIR, clientId, 'posts-latest.json');
  if (!existsSync(file)) return '';
  try {
    const d = JSON.parse(readFileSync(file, 'utf-8'));
    const platforms = d.platforms || d;
    const allCaptions = [];
    for (const list of Object.values(platforms)) {
      const arr = Array.isArray(list) ? list : (list?.posts || []);
      for (const p of arr.slice(0, 3)) {
        if (p.caption) allCaptions.push(p.caption.slice(0, 180));
      }
    }
    return allCaptions.slice(0, 6).join(' / ');
  } catch {
    return '';
  }
}

// ── LLM rank + structure ───────────────────────────

const RANK_PROMPT = `You are a social media intelligence analyst. Given a creator's positioning + raw web search results, produce a ranked list of 8-12 REAL competitors in the SAME NICHE.

CRITICAL RULES:
- Only include creators who operate in the SAME niche as the client. If the niche is UK property investment, DO NOT include makeup artists, motivational speakers, or generic influencers just because their name starts with the same letter.
- Every record MUST have ALL fields populated. No nulls, no empty rationale, no missing threatLevel. If you can't fill a field confidently, drop that whole competitor.
- Rank by SIMILARITY (same audience + same topic) not by follower count.
- For each competitor, "rationale" must EXPLICITLY connect them to the client's niche.

Return ONLY valid JSON with root key "competitors":
{
  "competitors": [
    {
      "name": "Real Creator/Brand Name",
      "rationale": "One sentence explaining niche overlap with the client (mandatory, non-empty)",
      "threatLevel": "high|medium|low",
      "similarity": 85,
      "geography": "local|global|adjacent",
      "platforms": {
        "instagram": "https://www.instagram.com/handle/ or empty string",
        "tiktok":    "https://www.tiktok.com/@handle/ or empty string",
        "linkedin":  "https://www.linkedin.com/in/handle/ or empty string"
      },
      "category": "short tag describing their specific niche",
      "evidenceSource": "URL of article or empty string"
    }
  ]
}

If source articles yielded irrelevant results (off-topic), return fewer accurate competitors (or an empty array) — do NOT fill the list with unrelated people.
Do NOT invent handles. Leave platform empty if not in sources.`;

async function rankCompetitors({ client, captions, articles }) {
  const articleBlob = articles
    .slice(0, 12)
    .map((a, i) => `### Source ${i + 1}: ${a.title || ''}\nURL: ${a.url || ''}\n${(a.text || '').slice(0, 1500)}`)
    .join('\n\n');

  const user = `Client: ${client.name}
Niche: ${client.niche || 'not specified'}
Geography: ${client.geography || detectGeography(client) || 'unspecified'}
Sample captions: ${captions || 'not available'}
Existing competitors (do NOT repeat these): ${(client.competitors || []).map(c => c.name).join(', ') || 'none yet'}

Web search results (each labelled by bucket: local / global / adjacent):
${articleBlob}

Rank 12-18 strongest NEW competitors. MUST include ALL three buckets:
- LOCAL (5-8): creators BASED in ${client.geography || detectGeography(client) || 'client\'s country'} who compete for the same local audience, regardless of content topic
- GLOBAL (4-6): category leaders worldwide in ${client.niche || 'the niche'} (can be in any country)
- ADJACENT (2-3): overlapping-audience creators in adjacent niches

If articles skew too heavily one way, USE YOUR WORLD KNOWLEDGE to fill the thin buckets. Do NOT return a list that's all "local" or all "global". Label each with "geography" field = "local" | "global" | "adjacent".

Return the JSON.`;

  const raw = await callLLM(user, 'competitor-rank', {
    maxTokens: 4000,
    tier: 'premium',
    model: process.env.COMPETITOR_DISCOVERY_MODEL || 'claude-sonnet-4-20250514',
  });

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.search(/[{\[]/);
  if (start > 0) cleaned = cleaned.slice(start);

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (err) {
    console.error('[competitor-rank] JSON parse failed:', err.message);
    return [];
  }

  const list = parsed.competitors || parsed.results || parsed.list || parsed.suggestions || (Array.isArray(parsed) ? parsed : []);

  // Normalise Sonnet's variable schema into our canonical shape
  return list.filter(c => c && c.name).map((c, i) => {
    // Build rationale from whatever fields Sonnet provided
    let rationale = c.rationale || c.reason || c.explanation || '';
    if (!rationale) {
      const parts = [];
      if (c.niche) parts.push(c.niche);
      if (c.content_style || c.contentStyle) parts.push(`style: ${c.content_style || c.contentStyle}`);
      if (Array.isArray(c.strengths) && c.strengths.length) {
        parts.push('strengths: ' + c.strengths.slice(0, 2).join(', '));
      }
      rationale = parts.join(' · ') || 'No rationale provided';
    }

    // Derive threatLevel from rank if not present (rank 1-3 = high, 4-7 = medium, rest = low)
    let threatLevel = (c.threatLevel || c.threat_level || c.threat || '').toLowerCase();
    if (!['high','medium','low'].includes(threatLevel)) {
      const rank = c.rank || (i + 1);
      threatLevel = rank <= 3 ? 'high' : rank <= 7 ? 'medium' : 'low';
    }

    // Derive similarity from rank if not present
    let similarity = Number(c.similarity || c.similarity_score || c.score);
    if (!Number.isFinite(similarity) || similarity < 0) {
      const rank = c.rank || (i + 1);
      similarity = Math.max(20, 100 - (rank - 1) * 8);
    }

    // Platforms — handle various shapes
    let platforms = c.platforms || c.social || c.handles || {};
    if (c.handle && !platforms.instagram && !platforms.tiktok && !platforms.linkedin) {
      // single handle string — infer platform from URL hints
      const h = String(c.handle).trim();
      if (h.includes('instagram')) platforms.instagram = h;
      else if (h.includes('tiktok')) platforms.tiktok = h;
      else if (h.includes('linkedin')) platforms.linkedin = h;
    }

    // Geography tag — accept local/global/adjacent; default to "global"
    let geography = (c.geography || c.geo || c.region_tag || '').toLowerCase();
    if (!['local', 'global', 'adjacent'].includes(geography)) {
      // Try to infer: if source URL or location hint matches, classify
      geography = 'global';
    }

    return {
      name: c.name,
      rationale: rationale.slice(0, 220),
      threatLevel,
      similarity: Math.min(100, Math.round(similarity)),
      geography,
      platforms: {
        instagram: platforms.instagram || '',
        tiktok:    platforms.tiktok    || '',
        linkedin:  platforms.linkedin  || '',
      },
      category: c.category || c.niche || c.type || '',
      evidenceSource: c.evidenceSource || c.evidence_source || c.source || '',
      extra: {
        strengths: Array.isArray(c.strengths) ? c.strengths : undefined,
        contentStyle: c.content_style || c.contentStyle,
        weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : undefined,
      },
    };
  });
}

function detectGeography(client) {
  // Naive heuristic from competitor-list hints
  const competitorHints = (client.competitors || []).map(c => c.party || '').join(' ').toLowerCase();
  if (/sg|singapore|psp|wp|pap/.test(competitorHints)) return 'Singapore';
  if (/uk|britain|england/.test(competitorHints)) return 'UK';
  return 'global / unspecified';
}

// ── Handle resolution (best-effort per-name Exa lookup) ──

async function resolveHandleForName(name) {
  const found = { instagram: '', tiktok: '', linkedin: '' };
  const platformQueries = [
    { key: 'instagram', q: `"${name}" site:instagram.com` },
    { key: 'tiktok',    q: `"${name}" site:tiktok.com` },
    { key: 'linkedin',  q: `"${name}" site:linkedin.com/in` },
  ];

  for (const { key, q } of platformQueries) {
    try {
      const res = await exaSearch(q, { numResults: 5, maxChars: 300 });
      for (const r of (res.results || [])) {
        const url = r.url || '';
        if (key === 'instagram' && url.match(/instagram\.com\/[^\/\?#]+\/?$/i) && !url.includes('/p/') && !url.includes('/reel/') && !url.includes('/explore/')) {
          found.instagram = url.split('?')[0].replace(/\/$/, '') + '/';
          break;
        }
        if (key === 'tiktok' && url.match(/tiktok\.com\/@[^\/\?#]+/i)) {
          const m = url.match(/tiktok\.com\/@([^\/\?#]+)/i);
          if (m) { found.tiktok = `https://www.tiktok.com/@${m[1]}`; break; }
        }
        if (key === 'linkedin' && url.match(/linkedin\.com\/in\/[^\/\?#]+/i)) {
          const m = url.match(/(https?:\/\/[^\/]*linkedin\.com\/in\/[^\/\?#]+)/i);
          if (m) { found.linkedin = m[1]; break; }
        }
      }
    } catch (err) {
      console.log(`    [resolve] "${name}" ${key} error: ${err.message?.slice(0, 60)}`);
    }
  }
  return found;
}

// ── Public: suggest competitors for one client ────

export async function suggestCompetitorsForClient(clientId) {
  const clientsFile = join(ROOT, 'clients.json');
  const allClients = JSON.parse(readFileSync(clientsFile, 'utf-8')).clients;
  const client = allClients.find(c => c.id === clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  console.log(`[comp-disc] Discovering competitors for ${client.name}...`);

  // Infer niche + geography in parallel
  let niche = client.niche;
  let geography;
  if (!niche) {
    console.log(`  [comp-disc] Inferring niche + geography…`);
    [niche, geography] = await Promise.all([
      inferClientNiche(client, clientId),
      inferClientGeography(client, clientId),
    ]);
  } else {
    geography = await inferClientGeography(client, clientId);
  }
  console.log(`  [comp-disc] Niche: "${niche}" | Geography: "${geography}"`);

  const queries = buildQueries(client, niche, geography);
  const articles = [];
  for (const { bucket, q } of queries) {
    try {
      const res = await exaSearch(q, { numResults: 6 });
      for (const r of (res.results || [])) {
        if (r.text && r.text.length > 200) {
          articles.push({ bucket, title: r.title, url: r.url, text: r.text });
        }
      }
    } catch (err) {
      console.log(`  [comp-disc] Exa "${q.slice(0, 40)}..." failed: ${err.message}`);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const uniqueArticles = articles.filter(a => seen.has(a.url) ? false : (seen.add(a.url), true));
  console.log(`  [comp-disc] Got ${uniqueArticles.length} unique articles from ${queries.length} queries`);

  const captions = getClientPositioningContext(clientId);
  const ranked = await rankCompetitors({ client, captions, articles: uniqueArticles });
  console.log(`  [comp-disc] LLM ranked ${ranked.length} competitor suggestions`);

  // Backfill missing rationales — ask LLM per-competitor where rationale is empty or placeholder
  const needsRationale = ranked.filter(c => !c.rationale || /^no rationale/i.test(c.rationale));
  if (needsRationale.length) {
    console.log(`  [comp-disc] Backfilling rationales for ${needsRationale.length} suggestions...`);
    for (const c of needsRationale) {
      try {
        const r = await callLLM(
          `Client: ${client.name} (niche: ${niche || 'unspecified'})
Competitor candidate: ${c.name}

Write ONE sentence (max 18 words) explaining why this person is a competitor to ${client.name} in the ${niche || client.name} niche. Be specific — reference their positioning. No preamble.`,
          'rationale-backfill',
          { maxTokens: 80, tier: 'premium', model: 'claude-sonnet-4-20250514' },
        );
        c.rationale = r.trim().replace(/^["']|["']$/g, '').replace(/^[-*]\s*/, '');
      } catch { /* keep placeholder */ }
    }
  }

  // Per-suggestion handle resolution for ones missing handles
  console.log(`  [comp-disc] Resolving handles for unresolved entries...`);
  const withName = ranked.filter(c => c.name);
  const suggestions = [];
  for (const c of withName) {
    const p = c.platforms || {};
    const hasHandle = !!(p.instagram || p.tiktok || p.linkedin);
    let resolved = {
      instagram: p.instagram || '',
      tiktok:    p.tiktok    || '',
      linkedin:  p.linkedin  || '',
    };
    // If no handles, try resolution (best-effort)
    if (!hasHandle) {
      try {
        const found = await resolveHandleForName(c.name);
        resolved = {
          instagram: resolved.instagram || found.instagram,
          tiktok:    resolved.tiktok    || found.tiktok,
          linkedin:  resolved.linkedin  || found.linkedin,
        };
      } catch { /* ignore */ }
    }
    const finalHasHandle = !!(resolved.instagram || resolved.tiktok || resolved.linkedin);
    suggestions.push({
      ...c,
      platforms: resolved,
      handleStatus: finalHasHandle ? 'resolved' : 'needs-manual-entry',
    });
  }

  const withHandles = suggestions.filter(s => s.handleStatus === 'verified' || s.handleStatus === 'resolved').length;
  const needingManualHandles = suggestions.length - withHandles;
  console.log(`  [comp-disc] ${withHandles} with handles, ${needingManualHandles} need manual handle entry`);

  const payload = {
    clientId,
    clientName: client.name,
    generatedAt: new Date().toISOString(),
    queriesUsed: queries,
    sourceCount: uniqueArticles.length,
    suggestionCount: suggestions.length,
    withHandles,
    needingManualHandles,
    suggestions,
    sources: uniqueArticles.slice(0, 10).map(a => ({ title: a.title, url: a.url })),
  };

  // Save to per-client file (NOT yet in clients.json — needs human approval)
  const clientDir = join(DATA_DIR, clientId);
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });
  writeFileSync(join(clientDir, 'competitor-suggestions.json'), JSON.stringify(payload, null, 2));

  return payload;
}

// ── Read pending suggestions ───────────────────────

export function getCompetitorSuggestions(clientId) {
  const file = join(DATA_DIR, clientId, 'competitor-suggestions.json');
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf-8')); }
  catch { return null; }
}

// ── Apply approved suggestions to clients.json ────

/**
 * approvals: [{ name, overrides?: { instagram?, tiktok?, linkedin? } }]
 * or a plain array of names for backwards compat.
 */
export function applyApprovedCompetitors(clientId, approvals) {
  const clientsFile = join(ROOT, 'clients.json');
  const data = JSON.parse(readFileSync(clientsFile, 'utf-8'));
  const client = data.clients.find(c => c.id === clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);

  const suggestions = getCompetitorSuggestions(clientId);
  if (!suggestions) throw new Error('No suggestions to apply — run discovery first');

  // Normalise to {name, overrides} shape
  const normalized = approvals.map(a => (typeof a === 'string' ? { name: a, overrides: {} } : a));
  const nameSet = new Set(normalized.map(a => a.name));

  const toAdd = suggestions.suggestions.filter(s => nameSet.has(s.name)).map(s => {
    const override = normalized.find(a => a.name === s.name)?.overrides || {};
    return {
      ...s,
      platforms: {
        instagram: override.instagram || s.platforms?.instagram || '',
        tiktok:    override.tiktok    || s.platforms?.tiktok    || '',
        linkedin:  override.linkedin  || s.platforms?.linkedin  || '',
      },
    };
  });

  if (!toAdd.length) return { added: 0, skipped: 0 };

  // Convert to clients.json schema (flatten platforms)
  const formatted = toAdd.map(s => {
    const out = { name: s.name };
    if (s.category) out.category = s.category;
    if (s.platforms?.instagram) out.instagram = s.platforms.instagram;
    if (s.platforms?.tiktok)    out.tiktok    = s.platforms.tiktok;
    if (s.platforms?.linkedin)  out.linkedin  = s.platforms.linkedin;
    out.source = 'ai-suggested';
    out.addedAt = new Date().toISOString().slice(0, 10);
    return out;
  });

  // Avoid dupes by name
  const existingNames = new Set((client.competitors || []).map(c => c.name.toLowerCase()));
  const fresh = formatted.filter(c => !existingNames.has(c.name.toLowerCase()));

  client.competitors = [...(client.competitors || []), ...fresh];

  writeFileSync(clientsFile, JSON.stringify(data, null, 2));

  return {
    added: fresh.length,
    skipped: formatted.length - fresh.length,
    totalNow: client.competitors.length,
  };
}
