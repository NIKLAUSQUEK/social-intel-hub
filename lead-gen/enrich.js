/**
 * Website enrichment — for leads with a website, read the homepage and a
 * contact page (robots.txt respected, rate-limited) to fill in emails,
 * phones and social links.
 */

import { politeGet } from './http.js';
import { extractContacts, extractSocials } from './extract.js';

const CONTACT_PATHS = ['/contact', '/contact-us', '/about'];

/** Collect hrefs that look like a contact page on the same site. */
export function findContactLinks(html, baseUrl) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!/contact|about|get-in-touch/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], baseUrl);
      if (u.host === new URL(baseUrl).host) out.add(u.href);
    } catch { /* ignore */ }
  }
  return [...out].slice(0, 2);
}

function mailtoAndTel(html) {
  const text = String(html);
  const mails = [...text.matchAll(/mailto:([^"'?\s>]+)/gi)].map(m => decodeURIComponent(m[1]));
  const tels = [...text.matchAll(/tel:([+\d\s().-]{8,})/gi)].map(m => m[1]);
  return `${mails.join(' ')} ${tels.join(' ')}`;
}

/** Visible text only — phone/email regexes on raw HTML hit CSS, JS and ids. */
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

export async function enrichFromWebsite(lead) {
  if (!lead.website) return lead;
  let base;
  try { base = new URL(lead.website).origin; } catch { return lead; }

  const home = await politeGet(base);
  if (!home) return lead;
  const pages = [home];
  const links = findContactLinks(home, base);
  const extra = links.length ? links : CONTACT_PATHS.slice(0, 1).map(p => base + p);
  for (const url of extra) {
    const html = await politeGet(url);
    if (html) pages.push(html);
  }

  const c = extractContacts(pages.map(h => `${mailtoAndTel(h)}\n${htmlToText(h)}`).join('\n'));
  // Social links live in hrefs, which htmlToText drops
  c.socials = extractSocials(pages.join('\n'));
  const site = new URL(base).hostname.replace(/^www\./, '');
  // Prefer addresses on the business's own domain; keep others only if none match
  const own = c.emails.filter(e => e.endsWith(`@${site}`));
  const emails = own.length ? own : c.emails.slice(0, 3);

  return {
    ...lead,
    emails: [...new Set([...lead.emails, ...emails])],
    phones: [...new Set([...lead.phones, ...c.phones.slice(0, 3)])],
    socials: Object.fromEntries(
      [...new Set([...Object.keys(lead.socials || {}), ...Object.keys(c.socials)])]
        .map(k => [k, [...new Set([...(lead.socials?.[k] || []), ...(c.socials[k] || [])])]]),
    ),
    evidence: [...lead.evidence, { source: 'website', url: base, at: new Date().toISOString() }],
  };
}
