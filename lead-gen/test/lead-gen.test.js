import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmails, extractPhones, extractSocials, hasBuyingIntent, isFreemail } from '../extract.js';
import { makeLead, dedupeLeads, scoreLead, leadsToCsv } from '../lead.js';
import { resultToLead, cleanTitle, buildQuery } from '../sources/social-search.js';
import { parseRobots } from '../http.js';
import { htmlToText, findContactLinks } from '../enrich.js';
import { isSuppressed } from '../index.js';

test('emails: plain, obfuscated, junk filtered', () => {
  assert.deepEqual(extractEmails('Bookings: Hello@SmileClinic.sg'), ['hello@smileclinic.sg']);
  assert.deepEqual(extractEmails('jane [at] studio [dot] com'), ['jane@studio.com']);
  assert.deepEqual(extractEmails('jane (at) studio (dot) com'), ['jane@studio.com']);
  assert.deepEqual(extractEmails('logo@2x.png noreply@shop.com user@example.com'), []);
});

test('freemail detection', () => {
  assert.equal(isFreemail('a@gmail.com'), true);
  assert.equal(isFreemail('a@smileclinic.sg'), false);
});

test('phones: international kept, dates and short numbers dropped', () => {
  assert.deepEqual(extractPhones('WhatsApp +65 9123 4567'), ['+6591234567']);
  assert.deepEqual(extractPhones('Call 0044 20 7946 0958'), ['+442079460958']);
  assert.deepEqual(extractPhones('Since 2024-05-01, 1,234 followers'), []);
});

test('socials: profiles kept, post/share links dropped', () => {
  const s = extractSocials('https://instagram.com/smile.sg https://instagram.com/p/Cx123 https://www.facebook.com/sharer.php https://www.tiktok.com/@smile.sg');
  assert.deepEqual(s.instagram, ['https://instagram.com/smile.sg']);
  assert.deepEqual(s.tiktok, ['https://www.tiktok.com/@smile.sg']);
  assert.equal(s.facebook, undefined);
});

test('buying intent', () => {
  assert.equal(hasBuyingIntent('Looking for a wedding photographer in Bali'), true);
  assert.equal(hasBuyingIntent('Our new menu is out'), false);
});

test('search hit → lead, wrong host or path rejected', () => {
  const r = {
    title: 'Smile Dental (@smile.sg) • Instagram photos and videos',
    url: 'https://www.instagram.com/smile.sg/',
    text: 'Family dentist in Singapore. Book: hello@smileclinic.sg / +65 6123 4567',
  };
  const lead = resultToLead('instagram', r, { keyword: 'dentist', location: 'Singapore', provider: 'brave' });
  assert.equal(lead.name, 'Smile Dental');
  assert.equal(lead.profileUrl, 'https://www.instagram.com/smile.sg');
  assert.deepEqual(lead.emails, ['hello@smileclinic.sg']);
  assert.deepEqual(lead.phones, ['+6561234567']);
  assert.equal(resultToLead('instagram', { ...r, url: 'https://evil.com/instagram.com' }, {}), null);
  assert.equal(resultToLead('linkedin', { ...r, url: 'https://www.linkedin.com/pulse/x' }, {}), null);
  assert.equal(resultToLead('facebook', { ...r, url: 'https://www.facebook.com/groups/123' }, {}), null);
});

test('title cleaning and query building', () => {
  assert.equal(cleanTitle('Jane Doe | LinkedIn'), 'Jane Doe');
  assert.equal(cleanTitle('Bakery SG (@bakerysg) on TikTok'), 'Bakery SG');
  assert.match(buildQuery('instagram', 'dentist', 'Singapore'), /^site:instagram\.com "dentist" "Singapore"/);
  assert.equal(buildQuery('facebook-groups', 'dentist', ''), 'site:facebook.com/groups "dentist"');
});

test('dedupe merges on shared email, scores and sorts', () => {
  const a = makeLead({ platform: 'instagram', name: 'Smile', profileUrl: 'https://instagram.com/smile', emails: ['hello@smile.sg'], keyword: 'dentist', bio: 'dentist', evidence: [{ url: 'a' }] });
  const b = makeLead({ platform: 'facebook', name: 'Smile Clinic', profileUrl: 'https://facebook.com/smile', emails: ['hello@smile.sg'], phones: ['+6561234567'], evidence: [{ url: 'b' }] });
  const c = makeLead({ platform: 'tiktok', name: 'Other', profileUrl: 'https://tiktok.com/@o', evidence: [] });
  const out = dedupeLeads([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Smile');
  assert.deepEqual(out[0].phones, ['+6561234567']);
  assert.equal(out[0].evidence.length, 2);
  assert.equal(out[0].score, 35 + 20 + 15);
  assert.equal(scoreLead(c), 0);
});

test('csv escapes quotes and neutralises formulas', () => {
  const l = makeLead({ platform: 'x', name: '=HYPERLINK("evil")', bio: 'say "hi"', evidence: [] });
  const csv = leadsToCsv([{ ...l, score: 1 }]);
  assert.match(csv, /"'=HYPERLINK\(""evil""\)"/);
  assert.match(csv, /"say ""hi"""/);
});

test('robots.txt parsing', () => {
  const r = parseRobots('User-agent: Googlebot\nDisallow: /a\n\nUser-agent: *\nDisallow: /private\nDisallow:\n');
  assert.deepEqual(r.disallow, ['/private']);
});

test('html helpers', () => {
  assert.equal(htmlToText('<style>.a{color:#123456}</style><p>Call&nbsp;us</p><script>var x=12345678</script>').trim(), 'Call us');
  assert.deepEqual(findContactLinks('<a href="/contact-us">x</a><a href="https://other.com/contact">y</a>', 'https://smile.sg'),
    ['https://smile.sg/contact-us']);
});

test('suppression by email, domain and URL', () => {
  const lead = makeLead({ platform: 'instagram', profileUrl: 'https://instagram.com/smile', emails: ['hello@smile.sg'], evidence: [] });
  const s = v => ({ entries: [{ value: v }] });
  assert.equal(isSuppressed(lead, s('hello@smile.sg')), true);
  assert.equal(isSuppressed(lead, s('@smile.sg')), true);
  assert.equal(isSuppressed(lead, s('https://instagram.com/smile')), true);
  assert.equal(isSuppressed(lead, s('someone@else.com')), false);
});

test('profile URLs: posts collapse to account, non-profiles rejected', async () => {
  const hit = (platform, url) => resultToLead(platform, { title: 't', url, text: '' }, {})?.profileUrl ?? null;
  assert.equal(hit('instagram', 'https://www.instagram.com/p/abc/'), null);
  assert.equal(hit('tiktok', 'https://www.tiktok.com/@bakery/video/123'), 'https://www.tiktok.com/@bakery');
  assert.equal(hit('x', 'https://x.com/bakery/status/99'), 'https://x.com/bakery');
  assert.equal(hit('youtube', 'https://www.youtube.com/watch?v=1'), null);
  assert.equal(hit('facebook', 'https://www.facebook.com/sharer.php?u=x'), null);
  assert.equal(hit('facebook-groups', 'https://www.facebook.com/groups/sgdentists/posts/1'), 'https://www.facebook.com/groups/sgdentists');
});

test('websites in bios', async () => {
  const { extractWebsites } = await import('../extract.js');
  assert.deepEqual(extractWebsites('Dentist at Bright Teeth. www.brightteeth.sg'), ['https://www.brightteeth.sg']);
  assert.deepEqual(extractWebsites('links: linktr.ee/smile · instagram.com/smile · hi@smile.sg'), ['https://linktr.ee/smile']);
});
