/**
 * Polite fetcher for public websites.
 *
 *   - honest User-Agent (identifies the bot + contact URL)
 *   - obeys robots.txt (cached per host)
 *   - one request per host per LEADGEN_HOST_DELAY_MS (default 1500ms)
 *   - HTML only, size-capped
 */

const UA = process.env.LEADGEN_USER_AGENT
  || 'SocialIntelLeadBot/1.0 (+https://github.com/NIKLAUSQUEK/social-intel-hub)';
const HOST_DELAY = Number(process.env.LEADGEN_HOST_DELAY_MS || 1500);
const MAX_BYTES = 1_500_000;

const robotsCache = new Map();  // host → { disallow: string[] }
const lastHit = new Map();      // host → timestamp

/** Minimal robots.txt parser: Disallow rules under `User-agent: *`. */
export function parseRobots(txt) {
  const disallow = [];
  let applies = false;
  for (const raw of String(txt).split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (key === 'user-agent') applies = v === '*' || UA.toLowerCase().includes(v.toLowerCase());
    else if (key === 'disallow' && applies && v) disallow.push(v);
  }
  return { disallow };
}

async function allowedByRobots(url) {
  const u = new URL(url);
  let rules = robotsCache.get(u.host);
  if (!rules) {
    try {
      const res = await fetch(`${u.protocol}//${u.host}/robots.txt`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8_000),
      });
      rules = res.ok ? parseRobots(await res.text()) : { disallow: [] };
    } catch {
      rules = { disallow: [] };
    }
    robotsCache.set(u.host, rules);
  }
  return !rules.disallow.some(p => u.pathname.startsWith(p));
}

async function waitForHost(host) {
  const wait = (lastHit.get(host) || 0) + HOST_DELAY - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/** Returns page HTML, or null if disallowed / not HTML / failed. */
export async function politeGet(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!(await allowedByRobots(url))) return null;
  await waitForHost(u.host);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return null;
    const html = await res.text();
    return html.slice(0, MAX_BYTES);
  } catch {
    return null;
  }
}
