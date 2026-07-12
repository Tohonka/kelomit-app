import {visitedLocations} from '../src/utils/visitedLocations';
import type {GpsPoint, SavedLocation} from '../src/types';

// timestamps `minutesFromZero` past a fixed epoch, so dwell math is exact.
const p = (lat: number, lng: number, min: number): GpsPoint => ({
  day_id: 1,
  latitude: lat,
  longitude: lng,
  accuracy: 5,
  altitude: null,
  speed: null,
  timestamp: new Date(Date.UTC(2026, 6, 13, 8, min, 0)).toISOString(),
});

const office: SavedLocation = {
  id: 1,
  name: 'Toimisto Turku',
  kind: 'work',
  latitude: 60.45,
  longitude: 22.27,
  radius_m: 150,
  created_at: '',
  updated_at: '',
};

describe('visitedLocations', () => {
  it('returns nothing for an empty track', () => {
    expect(visitedLocations([], [])).toEqual([]);
  });

  it('drops a cluster shorter than the min dwell', () => {
    // 3 min at one spot, below the 5-min default.
    const pts = [p(60.45, 22.27, 0), p(60.45, 22.27, 3)];
    expect(visitedLocations(pts, [office])).toEqual([]);
  });

  it('emits one visit and matches it to a saved place', () => {
    const pts = [p(60.45, 22.27, 0), p(60.4501, 22.2701, 10), p(60.45, 22.27, 20)];
    const out = visitedLocations(pts, [office]);
    expect(out).toHaveLength(1);
    expect(out[0].location?.name).toBe('Toimisto Turku');
  });

  it('splits two stays separated by travel, second unmatched', () => {
    const pts = [
      p(60.45, 22.27, 0), // office
      p(60.45, 22.27, 20),
      p(60.50, 22.40, 40), // ~10 km away, different stay, no saved place
      p(60.50, 22.40, 60),
    ];
    const out = visitedLocations(pts, [office]);
    expect(out).toHaveLength(2);
    expect(out[0].location?.name).toBe('Toimisto Turku');
    expect(out[1].location).toBeNull();
  });
});
