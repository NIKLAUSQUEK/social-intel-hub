/**
 * Contact extraction — pulls emails, phones and social profile links out of
 * free text (search snippets, bios, page HTML).
 *
 * Pure functions, no I/O, so they're unit-testable.
 */

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.sg', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com',
  'mail.com', 'yandex.com', 'qq.com', '163.com',
]);

// Things that look like emails but aren't contact addresses
const JUNK_EMAIL = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|(^(no-?reply|donotreply|example|test|user|name|email)@)|(@(example|sentry|domain|email|yoursite|wixpress)\.)/i;

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/**
 * Normalise "name [at] domain [dot] com" style obfuscation before matching.
 */
export function deobfuscate(text) {
  return String(text || '')
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/\s*[\[(<{]\s*at\s*[\])>}]\s*/gi, '@')
    .replace(/\s*[\[(<{]\s*dot\s*[\])>}]\s*/gi, '.')
    .replace(/\s+at\s+(?=[a-z0-9-]+\s*(\.|\s+dot\s+)[a-z]{2,})/gi, '@')
    .replace(/(@[a-z0-9-]+)\s+dot\s+([a-z]{2,})/gi, '$1.$2');
}

export function extractEmails(text) {
  const found = deobfuscate(text).match(EMAIL_RE) || [];
  const out = new Set();
  for (let e of found) {
    e = e.toLowerCase().replace(/^[._-]+|[._-]+$/g, '');
    if (JUNK_EMAIL.test(e)) continue;
    out.add(e);
  }
  return [...out];
}

export function isFreemail(email) {
  return FREEMAIL.has(String(email).split('@')[1] || '');
}

/**
 * Phones: international (+65 9123 4567) or long local runs. We keep digits-only
 * plus a leading '+', and require 8–15 digits (E.164 max) so dates/prices drop out.
 */
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{6,18}\d/g;

export function extractPhones(text) {
  const found = String(text || '').match(PHONE_RE) || [];
  const out = new Set();
  for (const raw of found) {
    // Skip things like 2024-05-01 or 1.234.567 (dates / numbers)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) continue;
    let digits = raw.replace(/[^\d+]/g, '');
    if (digits.startsWith('00')) digits = '+' + digits.slice(2);
    const n = digits.replace('+', '').length;
    if (n < 8 || n > 15) continue;
    if (/^(\d)\1+$/.test(digits.replace('+', ''))) continue; // 00000000
    out.add(digits);
  }
  return [...out];
}

const SOCIAL_PATTERNS = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/([a-z0-9._]{2,30})\/?/gi,
  facebook: /https?:\/\/(?:www\.|m\.)?facebook\.com\/((?:groups\/)?[a-z0-9.\-]{3,80})\/?/gi,
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/((?:in|company)\/[a-z0-9\-_%]{2,100})\/?/gi,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/(@[a-z0-9._]{2,30})\/?/gi,
  x: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([a-z0-9_]{2,15})\/?/gi,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/((?:@|c\/|channel\/)[a-z0-9._\-]{2,60})\/?/gi,
};

// Path segments that are platform pages, not profiles
const NON_PROFILE = /^(p|reel|reels|explore|stories|share|sharer|sharer\.php|watch|intent|hashtag|search|login|policies|privacy|help|about|legal|tr|plugins|dialog|home\.php|events|marketplace|watch|status|i)(\/|$)/i;

export function extractSocials(text) {
  const out = {};
  for (const [platform, re] of Object.entries(SOCIAL_PATTERNS)) {
    re.lastIndex = 0;
    for (const m of String(text || '').matchAll(re)) {
      const handle = m[1].replace(/\/$/, '');
      if (NON_PROFILE.test(handle)) continue;
      const url = m[0].replace(/\/$/, '');
      (out[platform] ||= new Set()).add(url.toLowerCase());
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

const SOCIAL_HOSTS = /(^|\.)(instagram|facebook|fb|linkedin|tiktok|twitter|x|youtube|youtu|threads|pinterest|wa|whatsapp|t)\.(com|me|be|net)$/i;
const WEBSITE_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]{1,62}(?:\.[a-z0-9-]{2,62})*\.(?:com|net|org|co|io|sg|my|uk|au|id|ph|th|vn|in|ee|biz|info|shop|store|studio|me)(?:\.[a-z]{2})?(?:\/[^\s"'<>)]*)?/gi;

/** Websites mentioned in a bio ("www.brightteeth.sg", "linktr.ee/x"), socials and emails excluded. */
export function extractWebsites(text) {
  const t = deobfuscate(text);
  const emailDomains = new Set((t.match(EMAIL_RE) || []).map(e => e.split('@')[1].toLowerCase()));
  const out = new Set();
  for (const m of t.matchAll(WEBSITE_RE)) {
    const prev = t[m.index - 1];
    if (prev === '@' || prev === '.') continue; // part of an email or a longer host
    let u;
    try { u = new URL(/^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`); } catch { continue; }
    const host = u.hostname.toLowerCase();
    if (SOCIAL_HOSTS.test(host) || (emailDomains.has(host) && !/^(https?:|www\.)/i.test(m[0]))) continue;
    out.add(`${u.protocol}//${host}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`);
  }
  return [...out];
}

const INTENT_RE = /\b(looking for|recommend(ation)?s? (for|a)|need (a|an|someone)|anyone know|hiring|seeking|who can|quote for|budget (is|of))\b/i;

export function hasBuyingIntent(text) {
  return INTENT_RE.test(String(text || ''));
}

/** Everything at once — used by every source. */
export function extractContacts(text) {
  return {
    emails: extractEmails(text),
    phones: extractPhones(text),
    socials: extractSocials(text),
    websites: extractWebsites(text),
  };
}
