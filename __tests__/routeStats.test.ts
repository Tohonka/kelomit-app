import {routeStats} from '../src/utils/routeStats';
import type {GpsPoint} from '../src/types';

const p = (latitude: number, longitude: number, timestamp: string): GpsPoint => ({
  day_id: 1,
  latitude,
  longitude,
  accuracy: null,
  altitude: null,
  speed: null,
  timestamp,
});

describe('routeStats', () => {
  it('is zero for no points', () => {
    expect(routeStats([])).toEqual({distanceM: 0, durationSec: 0});
  });

  it('is zero for a single point', () => {
    expect(routeStats([p(60.17, 24.94, '2026-06-29T08:00:00.000Z')])).toEqual({
      distanceM: 0,
      durationSec: 0,
    });
  });

  it('measures distance and duration between two points', () => {
    const out = routeStats([
      p(60.1700, 24.9400, '2026-06-29T08:00:00.000Z'),
      p(60.1720, 24.9400, '2026-06-29T08:10:00.000Z'),
    ]);
    expect(out.distanceM).toBeGreaterThan(200);
    expect(out.distanceM).toBeLessThan(245);
    expect(out.durationSec).toBe(600);
  });

  it('sums consecutive legs over multiple points', () => {
    const out = routeStats([
      p(60.1700, 24.9400, '2026-06-29T08:00:00.000Z'),
      p(60.1710, 24.9400, '2026-06-29T08:05:00.000Z'),
      p(60.1720, 24.9400, '2026-06-29T08:10:00.000Z'),
    ]);
    expect(out.distanceM).toBeGreaterThan(200);
    expect(out.distanceM).toBeLessThan(245);
    expect(out.durationSec).toBe(600);
  });
});
