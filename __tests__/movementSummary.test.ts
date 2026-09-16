import {summarizeSegments} from '../src/utils/movementSummary';
import type {DayRouteSegment} from '../src/types';

const t0 = Date.parse('2026-09-16T08:00:00.000Z');
const iso = (offsetSec: number) => new Date(t0 + offsetSec * 1000).toISOString();
// ~0.0009° latitude ≈ 100 m.
const seg = (over: Partial<DayRouteSegment>): DayRouteSegment => ({
  id: 1, day_id: 1, sequence: 0, start_ts: iso(0), end_ts: iso(120), origin_stop_id: null, destination_stop_id: null,
  coordinates: [
    {latitude: 60.45, longitude: 22.26, t: t0},
    {latitude: 60.4509, longitude: 22.26, t: t0 + 60000},
    {latitude: 60.4518, longitude: 22.26, t: t0 + 120000},
  ],
  distance_m: 200, duration_sec: 120, average_speed_mps: 1.7, maximum_speed_mps: 2, raw_last_ts: iso(120),
  mode_spans: [
    {mode: 'foot', startTs: iso(0), endTs: iso(60)},
    {mode: 'cycle', startTs: iso(60), endTs: iso(120)},
  ],
  still_seconds: 0, via: null, created_at: '', updated_at: '',
  ...over,
});

it('splits seconds and metres per mode from spans + polyline', () => {
  const s = summarizeSegments([seg({})]);
  expect(s.footSec).toBe(60);
  expect(s.cycleSec).toBe(60);
  expect(s.footM).toBeGreaterThan(95);
  expect(s.footM).toBeLessThan(105);
  expect(s.cycleM).toBeGreaterThan(95);
  expect(s.cycleM).toBeLessThan(105);
  expect(s.vehicleSec).toBe(0);
});

it('skips pre-v25 rows without spans and sums still time', () => {
  const s = summarizeSegments([seg({mode_spans: null, still_seconds: 300}), seg({still_seconds: 30})]);
  expect(s.footSec).toBe(60);
  expect(s.stillSec).toBe(30);
});
