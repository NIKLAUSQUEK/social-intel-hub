#!/usr/bin/env node
/**
 * Meta Graph API CLI — test + maintain credentials
 *
 * Usage:
 *   node scraper/platforms/meta-cli.js ping                      → verify credentials
 *   node scraper/platforms/meta-cli.js scrape <ig_username>      → test scraping a target
 *   node scraper/platforms/meta-cli.js extend                    → extend page token to 60 days
 *   node scraper/platforms/meta-cli.js check-token               → debug current token
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '..', '.env.local'), override: true });

const { pingMeta, scrapeIGViaMeta, extendPageToken, isMetaAvailable } =
  await import('./meta-graph.js');

const [,, cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'ping':
      return doPing();
    case 'scrape':
      return doScrape(args[0]);
    case 'extend':
      return doExtend();
    case 'check-token':
      return doCheckToken();
    default:
      console.log('Commands: ping | scrape <ig_username> | extend | check-token');
      process.exit(1);
  }
}

async function doPing() {
  if (!isMetaAvailable()) {
    console.error('✗ META_IG_BUSINESS_ID or META_PAGE_ACCESS_TOKEN not set in .env.local');
    console.error('  See scraper/platforms/META_SETUP.md for setup.');
    process.exit(2);
  }
  try {
    const r = await pingMeta();
    console.log('✓ Meta Graph API working');
    console.log(`  IG: @${r.ig_business_account}`);
    console.log(`  Followers: ${r.followers?.toLocaleString() || '?'}`);
    console.log(`  Media: ${r.mediaCount}`);
  } catch (err) {
    console.error('✗ Ping failed:', err.message);
    if (/190|expired/i.test(err.message)) {
      console.error('  → Token expired. Run: node scraper/platforms/meta-cli.js extend');
    }
    process.exit(3);
  }
}

async function doScrape(username) {
  if (!username) {
    console.error('Usage: meta-cli.js scrape <ig_username>');
    process.exit(1);
  }
  console.log(`Scraping IG @${username} via Meta Graph...`);
  try {
    const r = await scrapeIGViaMeta(username);
    if (!r.success) {
      console.error('✗ Scrape failed:', r.error);
      console.error('  Note: Meta Graph business_discovery only works for Business/Creator accounts.');
      console.error('  If this is a personal account, fall back to Apify/SocialKit.');
      process.exit(4);
    }
    console.log(`✓ @${r.username} (${r.displayName || 'no display name'})`);
    console.log(`  Followers:   ${r.followers?.toLocaleString()}`);
    console.log(`  Following:   ${r.following?.toLocaleString()}`);
    console.log(`  Total posts: ${r.posts}`);
    console.log(`  Recent posts returned: ${r.recentPosts.length}`);
    console.log(`  Bio: ${r.bio?.slice(0, 80) || '—'}`);
    if (r.recentPosts[0]) {
      const p = r.recentPosts[0];
      console.log(`  Latest: ${p.type} — ${p.likes ?? '?'}❤ ${p.comments ?? '?'}💬 — ${(p.caption||'').slice(0,60)}`);
    }
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(5);
  }
}

async function doExtend() {
  const current = process.env.META_PAGE_ACCESS_TOKEN;
  if (!current) {
    console.error('✗ META_PAGE_ACCESS_TOKEN not set. Paste a short-lived page token first.');
    process.exit(2);
  }
  console.log('Extending page token to long-lived (60 days)...');
  try {
    const r = await extendPageToken(current);
    console.log('\n✓ New long-lived token generated:');
    console.log('─────────────────────────────────────────');
    console.log(r.access_token);
    console.log('─────────────────────────────────────────');
    console.log(`  Type:       ${r.token_type}`);
    console.log(`  Expires in: ${r.expires_in ? (r.expires_in / 86400).toFixed(0) + ' days' : '(never — good)'}`);
    console.log('\nNext step: paste this into .env.local as META_PAGE_ACCESS_TOKEN and restart the server.');
  } catch (err) {
    console.error('✗ Extend failed:', err.message);
    process.exit(6);
  }
}

async function doCheckToken() {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) { console.error('META_PAGE_ACCESS_TOKEN not set'); process.exit(1); }
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const url = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const d = json.data || {};
    console.log('Token debug:');
    console.log(`  Type:       ${d.type}`);
    console.log(`  App:        ${d.application}`);
    console.log(`  Valid:      ${d.is_valid}`);
    console.log(`  Scopes:     ${(d.scopes || []).join(', ') || '(none)'}`);
    console.log(`  Expires:    ${d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'never'}`);
    console.log(`  Issued:     ${d.issued_at ? new Date(d.issued_at * 1000).toISOString() : '—'}`);
    console.log(`  User/Page:  ${d.profile_id || d.user_id || '—'}`);
  } catch (err) {
    console.error('✗ Debug failed:', err.message);
    process.exit(7);
  }
}

main();
