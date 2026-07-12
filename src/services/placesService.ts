import {getDB} from '../db/database';
import {getMapsApiKey} from '../native/backgroundLocation';

// Google Places (New) lookup for naming a stay that doesn't fall inside a saved
// location. Only the free-tier fields are requested — displayName + id via the
// field mask, so the call bills at the Places "Pro" SKU (5,000 free/month;
// effectively free for one user). Results are cached per ~11 m cell (empty name
// cached too) so a spot is only ever fetched once. Reuses the app's build-time
// Google Maps key (.maps.env, exposed as a native constant) — no key is stored
// in the app database.

/** lat,lng rounded to 4 decimals (~11 m) — the cache/dedup key. */
function cellFor(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function getCached(cell: string): Promise<string | null | undefined> {
  const db = getDB();
  const res = await db.execute('SELECT name FROM place_cache WHERE cell = ?;', [cell]);
  const row = res.rows?.[0] as {name: string} | undefined;
  if (!row) {
    return undefined; // never fetched
  }
  return row.name || null; // '' = fetched, nothing nearby
}

async function putCached(cell: string, name: string, placeId: string): Promise<void> {
  const db = getDB();
  await db.execute(
    'INSERT OR REPLACE INTO place_cache (cell, name, place_id) VALUES (?, ?, ?);',
    [cell, name, placeId],
  );
}

export async function resolvePlaceName(lat: number, lng: number): Promise<string | null> {
  const cell = cellFor(lat, lng);
  const cached = await getCached(cell);
  if (cached !== undefined) {
    return cached;
  }
  const key = getMapsApiKey().trim();
  if (!key) {
    return null;
  }
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.id',
      },
      body: JSON.stringify({
        maxResultCount: 1,
        rankPreference: 'DISTANCE',
        locationRestriction: {circle: {center: {latitude: lat, longitude: lng}, radius: 60}},
      }),
    });
    if (!res.ok) {
      return null; // don't cache auth/quota errors — let it retry later
    }
    const json = (await res.json()) as {places?: {displayName?: {text?: string}; id?: string}[]};
    const place = json.places?.[0];
    const name = place?.displayName?.text ?? '';
    await putCached(cell, name, place?.id ?? '');
    return name || null;
  } catch {
    return null;
  }
}
