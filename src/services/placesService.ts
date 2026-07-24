import {getDB} from '../db/database';
import {getMapsApiKey} from '../native/backgroundLocation';
import {distanceMeters} from './locationUtils';

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

export interface PlaceCandidate {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceM: number;
}

function isCandidate(value: unknown): value is PlaceCandidate {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.placeId === 'string' &&
    candidate.placeId.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    typeof candidate.distanceM === 'number' &&
    Number.isFinite(candidate.distanceM) &&
    candidate.distanceM >= 0
  );
}

async function getCachedCandidates(
  cell: string,
  lat: number,
  lng: number,
): Promise<PlaceCandidate[] | undefined> {
  const result = await getDB().execute(
    'SELECT candidates_json FROM place_cache WHERE cell = ?;',
    [cell],
  );
  const value = result.rows?.[0]?.candidates_json;
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isCandidate)) {
      return undefined;
    }
    return parsed
      .map(candidate => ({
        ...candidate,
        distanceM: distanceMeters(
          lat,
          lng,
          candidate.latitude,
          candidate.longitude,
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM);
  } catch {
    return undefined;
  }
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

async function putCachedCandidates(
  cell: string,
  candidates: PlaceCandidate[],
): Promise<void> {
  const nearest = candidates[0];
  await getDB().execute(
    `INSERT INTO place_cache (cell, name, place_id, fetched_at, candidates_json)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(cell) DO UPDATE SET
       name = excluded.name,
       place_id = excluded.place_id,
       fetched_at = excluded.fetched_at,
       candidates_json = excluded.candidates_json;`,
    [
      cell,
      nearest?.name ?? '',
      nearest?.placeId ?? '',
      JSON.stringify(candidates),
    ],
  );
}

function normalizeCandidates(
  value: unknown,
  lat: number,
  lng: number,
): PlaceCandidate[] | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }
  const places = (value as {places?: unknown}).places;
  if (places === undefined) {
    return [];
  }
  if (!Array.isArray(places)) {
    return null;
  }

  const candidates: PlaceCandidate[] = [];
  for (const item of places) {
    if (item == null || typeof item !== 'object') {
      return null;
    }
    const place = item as {
      id?: unknown;
      displayName?: {text?: unknown};
      location?: {latitude?: unknown; longitude?: unknown};
    };
    if (
      typeof place.id !== 'string' ||
      !place.id ||
      typeof place.displayName?.text !== 'string' ||
      !place.displayName.text ||
      typeof place.location?.latitude !== 'number' ||
      !Number.isFinite(place.location.latitude) ||
      typeof place.location.longitude !== 'number' ||
      !Number.isFinite(place.location.longitude)
    ) {
      return null;
    }
    candidates.push({
      placeId: place.id,
      name: place.displayName.text,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      distanceM: distanceMeters(
        lat,
        lng,
        place.location.latitude,
        place.location.longitude,
      ),
    });
  }
  return candidates.sort((a, b) => a.distanceM - b.distanceM);
}

export async function resolvePlaceCandidates(
  lat: number,
  lng: number,
): Promise<PlaceCandidate[]> {
  const cell = cellFor(lat, lng);
  const cached = await getCachedCandidates(cell, lat, lng);
  if (cached !== undefined) {
    return cached;
  }
  const key = getMapsApiKey().trim();
  if (!key) {
    throw new Error('Google Places API key is unavailable');
  }
  const response = await fetch(
    'https://places.googleapis.com/v1/places:searchNearby',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.displayName,places.id,places.location',
      },
      body: JSON.stringify({
        maxResultCount: 10,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: {latitude: lat, longitude: lng},
            radius: 60,
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error('Google Places request failed');
  }
  const candidates = normalizeCandidates(await response.json(), lat, lng);
  if (candidates === null) {
    throw new Error('Google Places returned malformed candidates');
  }
  await putCachedCandidates(cell, candidates);
  return candidates;
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
