/**
 * Local businesses via the official Google Places API (Text Search, New).
 *
 * Setup: Google Cloud → enable "Places API (New)" → API key → GOOGLE_PLACES_API_KEY
 * Pricing: billed per request by Google; Text Search Pro fields ≈ $0.032/request.
 */

import { makeLead } from '../lead.js';

const FIELDS = [
  'places.displayName', 'places.formattedAddress', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.primaryTypeDisplayName',
  'places.rating', 'places.userRatingCount', 'nextPageToken',
].join(',');

export function placeToLead(p, { keyword, location }) {
  const phone = (p.internationalPhoneNumber || '').replace(/[^\d+]/g, '');
  return makeLead({
    name: p.displayName?.text || '',
    platform: 'google-maps',
    profileUrl: p.googleMapsUri || '',
    bio: [p.primaryTypeDisplayName?.text, p.formattedAddress,
      p.rating ? `${p.rating}★ (${p.userRatingCount || 0} reviews)` : ''].filter(Boolean).join(' · '),
    phones: phone ? [phone] : [],
    website: p.websiteUri || '',
    location: p.formattedAddress || location,
    keyword,
    evidence: [{ source: 'google-places', url: p.googleMapsUri || '', at: new Date().toISOString() }],
  });
}

export async function findPlaces({ keyword, location, numResults = 20 }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not set');

  const leads = [];
  let pageToken;
  while (leads.length < numResults) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({
        textQuery: location ? `${keyword} in ${location}` : keyword,
        pageSize: Math.min(20, numResults - leads.length),
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const j = await res.json();
    for (const p of j.places || []) leads.push(placeToLead(p, { keyword, location }));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return { leads, groups: [], query: `${keyword} in ${location}` };
}
