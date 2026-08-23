import {
  deriveRouteDay,
  filteredMaximumSpeedMps,
  type RouteAnchor,
} from '../src/utils/routeSegments';
import type {ActivityEvent, GpsPoint} from '../src/types';
import fixture65196 from './fixtures/routeDay-65196.json';
import fixtureParkkipaikka from './fixtures/routeDay-parkkipaikka.json';

const METRES_PER_DEGREE = 111194.92664455874;
const baseMs = Date.parse('2026-07-24T08:00:00.000Z');

const p = (
  seconds: number,
  northM: number,
  eastM = 0,
  speed: number | null = null,
  dayId = 1,
): GpsPoint => ({
  day_id: dayId,
  latitude: northM / METRES_PER_DEGREE,
  longitude: eastM / METRES_PER_DEGREE,
  accuracy: 5,
  altitude: null,
  speed,
  timestamp: new Date(baseMs + seconds * 1000).toISOString(),
});

describe('filteredMaximumSpeedMps', () => {
  it('filters isolated spikes with centered three-sample medians', () => {
    expect(filteredMaximumSpeedMps([10, 11, 60, 12, 11], 0)).toBe(12);
    expect(filteredMaximumSpeedMps([10, 11, 12], 0)).toBe(11);
  });

  it('uses short valid sequences and falls back when none remain', () => {
    expect(filteredMaximumSpeedMps([10, 11], 0)).toBe(11);
    expect(filteredMaximumSpeedMps([], 7)).toBe(7);
    expect(filteredMaximumSpeedMps([-1, Number.NaN, Infinity, 71], 8)).toBe(8);
  });
});

const anchor = (
  id: number,
  name: string,
  northM: number,
  radiusM: number,
  type: RouteAnchor['type'] = 'saved',
): RouteAnchor => ({
  id,
  type,
  name,
  latitude: northM / METRES_PER_DEGREE,
  longitude: 0,
  radiusM,
});

describe('deriveRouteDay', () => {
  it('keeps a real-data-shaped walking supermarket visit as one stop', () => {
    const points = [
      p(0, 0, 0, 1.4),
      p(120, 65, 0, 1.5),
      p(300, 110, 0, 0.8),
      p(600, 70, 40, 1.2),
      p(900, 15, 30, 0.7),
      p(1200, -20, 10, 1.4),
    ];
    const out = deriveRouteDay(points, [], [{
      activity: 'walking',
      transition: 'enter',
      timestamp: p(30, 0).timestamp,
    }]);

    expect(out.stops).toHaveLength(1);
    expect(out.stops[0]).toMatchObject({
      startTs: points[0].timestamp,
      endTs: points.at(-1)?.timestamp,
    });
  });

  it('does not turn a traffic light into a stop while vehicle is active', () => {
    const points = Array.from({length: 7}, (_, index) =>
      p(index * 60, 0, 0, 0),
    );

    expect(deriveRouteDay(points, [], [{
      activity: 'vehicle',
      transition: 'enter',
      timestamp: p(0, 0).timestamp,
    }]).stops).toEqual([]);
  });

  it('requires five minutes even inside a known place', () => {
    const office = anchor(1, 'Office', 0, 70);
    const out = deriveRouteDay([p(0, 0), p(299, 0)], [office]);

    expect(out.stops).toEqual([]);
  });

  it('backdates a confirmed known stop to the first qualifying point', () => {
    const office = anchor(1, 'Office', 0, 70);
    const out = deriveRouteDay(
      [p(0, 0), p(150, 10), p(300, -10)],
      [office],
    );

    expect(out.stops[0]).toMatchObject({
      startTs: p(0, 0).timestamp,
      endTs: p(300, -10).timestamp,
      anchor: office,
    });
  });

  it('uses accuracy uncertainty without splitting an indoor stop', () => {
    const points = [
      {...p(0, 0), accuracy: 40},
      {...p(300, 260), accuracy: 40},
      {...p(600, 0), accuracy: 40},
    ];

    expect(deriveRouteDay(points, []).stops).toHaveLength(1);
  });

  it('ends a stop before two consecutive fast fixes', () => {
    const points = [
      p(0, 0),
      p(300, 0),
      p(360, 5),
      p(370, 40, 0, 3.2),
      p(380, 90, 0, 4),
    ];
    const out = deriveRouteDay(points, []);

    expect(out.stops[0].endTs).toBe(p(360, 5).timestamp);
  });

  it('uses the same GPS-only fallback when activity evidence is absent or empty', () => {
    const points = [p(0, 0), p(150, 10), p(300, -10)];

    expect(deriveRouteDay(points, [])).toEqual(
      deriveRouteDay(points, [], []),
    );
  });

  it('keeps a 299-second compact cluster in one trip', () => {
    const out = deriveRouteDay(
      [p(0, 0), p(100, 20), p(299, -20), p(310, 500)],
      [],
    );

    expect(out.stops).toEqual([]);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].coordinates).toHaveLength(4);
  });

  it('splits a 300-second compact cluster at its arrival point', () => {
    const out = deriveRouteDay(
      [
        p(0, -500),
        p(50, -100),
        p(100, 0),
        p(400, 20),
        p(450, 500),
        p(500, 1000),
      ],
      [],
    );

    expect(out.stops).toHaveLength(1);
    expect(out.stops[0]).toMatchObject({
      startTs: p(100, 0).timestamp,
      endTs: p(400, 20).timestamp,
      anchor: null,
    });
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0].coordinates).toEqual([
      {latitude: p(0, -500).latitude, longitude: 0, t: baseMs},
      {latitude: p(50, -100).latitude, longitude: 0, t: baseMs + 50_000},
      {latitude: p(100, 0).latitude, longitude: 0, t: baseMs + 100_000},
    ]);
    expect(out.segments[0].destinationStopKey).toBe(out.stops[0].key);
    expect(out.segments[1].originStopKey).toBe(out.stops[0].key);
  });

  it('does not create a boundary for a GPS time gap without spatial dwell', () => {
    const out = deriveRouteDay(
      [p(0, 0), p(10, 500), p(3600, 1000), p(3610, 1500)],
      [],
    );

    expect(out.stops).toEqual([]);
    expect(out.segments).toHaveLength(1);
  });

  it('keeps independently day-scoped calls from crossing midnight', () => {
    const beforeMidnight = [
      {...p(0, 0, 0, null, 24), timestamp: '2026-07-24T23:59:00.000Z'},
      {...p(0, 100, 0, null, 24), timestamp: '2026-07-24T23:59:59.000Z'},
    ];
    const afterMidnight = [
      {...p(0, 200, 0, null, 25), timestamp: '2026-07-25T00:00:00.000Z'},
      {...p(0, 300, 0, null, 25), timestamp: '2026-07-25T00:01:00.000Z'},
    ];

    const first = deriveRouteDay(beforeMidnight, []);
    const second = deriveRouteDay(afterMidnight, []);

    expect(first.segments[0]).toMatchObject({
      startTs: '2026-07-24T23:59:00.000Z',
      endTs: '2026-07-24T23:59:59.000Z',
    });
    expect(second.segments[0]).toMatchObject({
      startTs: '2026-07-25T00:00:00.000Z',
      endTs: '2026-07-25T00:01:00.000Z',
    });
  });

  it('sorts points and derives distance, duration, weighted speed, and recorded maximum', () => {
    const points = [p(50, 300, 0, 4), p(0, 0, 0, 2), p(10, 100)];
    const out = deriveRouteDay(points, []);

    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].distanceM).toBeCloseTo(300, 3);
    expect(out.segments[0].durationSec).toBe(50);
    expect(out.segments[0].averageSpeedMps).toBeCloseTo(6, 3);
    expect(out.segments[0].maximumSpeedMps).toBe(4);
    expect(out.segments[0].rawLastTs).toBe(p(50, 300).timestamp);
    expect(points[0].timestamp).toBe(p(50, 300).timestamp);
  });

  it('falls back to the fastest leg when no valid recorded speed exists', () => {
    const out = deriveRouteDay(
      [p(0, 0, 0, -1), p(10, 100, 0, Number.NaN), p(50, 300)],
      [],
    );

    expect(out.segments[0].maximumSpeedMps).toBeCloseTo(10, 3);
  });
});

const deriveFixture = (fixture: unknown) => {
  const {points, events, anchors} = fixture as {
    points: GpsPoint[];
    events: ActivityEvent[];
    anchors: RouteAnchor[];
  };
  return deriveRouteDay(points, anchors, events);
};

describe('deriveRouteDay enrichment', () => {
  it('stamps every coordinate with its fix epoch ms', () => {
    const points = [p(0, 0, 0, 10), p(30, 100, 0, 10), p(60, 200, 0, 10)];
    const {segments} = deriveRouteDay(points, [], []);

    expect(segments[0].coordinates.map(c => c.t)).toEqual(
      points.map(point => Date.parse(point.timestamp)),
    );
  });

  it('counts still_seconds from sub-0.7 m/s fix pairs, capping each gap at 120 s', () => {
    // Total span stays under STOP_WINDOW_MS (5 min) so this remains one moving
    // segment and never becomes a dwell stop.
    const points = [
      p(0, 0, 0, 10),
      p(30, 100, 0, 0.1), // slow pair starts
      p(60, 100, 0, 0.2), // +30 s still
      p(180, 100, 0, 0.1), // 120 s gap → +120 (at the cap)
      p(210, 200, 0, 10),
    ];
    const {segments} = deriveRouteDay(points, [], []);

    expect(segments[0].stillSeconds).toBe(150);
  });

  it('emits a via pause for a >=120 s still span and mode spans for the trip (fixture day 65196)', () => {
    const {segments} = deriveFixture(fixture65196);
    // The 12:14–13:04 drive contains the 12:37:37–12:42:54 walk+still errand.
    const drive = segments.find(s => s.startTs.startsWith('2026-08-21T12:14'));

    expect(drive).toBeDefined();
    expect(drive!.modeSpans.some(s => s.mode === 'vehicle')).toBe(true);
    expect(drive!.modeSpans.some(s => s.mode === 'foot')).toBe(true);
    expect(drive!.via).toEqual([
      {
        kind: 'pause',
        startTs: '2026-08-21T12:38:54.263Z',
        endTs: '2026-08-21T12:42:54.229Z',
        name: null, // no anchor covers the errand
      },
    ]);
    // Not stillSeconds: across this whole 50-minute drive only 6 fixes read
    // below 0.7 m/s and no two are adjacent, so its GPS-speed still time is
    // genuinely 0 — the errand's stillness is AR evidence (the pause above),
    // not a speed reading. Other segments of the day do accumulate it.
    expect(segments.filter(s => s.stillSeconds > 0)).toHaveLength(3);
  });

  it('keeps the trip’s own endpoint anchors out of via (fixture day 65196)', () => {
    const {segments} = deriveFixture(fixture65196);
    // Home 05:51 → the Easy Turku parking lot 06:06. Home is this trip's origin
    // stop and the lot is its destination stop: neither is a waypoint.
    const commute = segments[1];

    expect(commute.originStopKey).toBe('saved:9:2026-08-20T21:24:47.195Z');
    expect(commute.destinationStopKey).toBe(
      'reusable:2:2026-08-21T06:06:38.241Z',
    );
    expect(commute.via).toEqual([
      // The lot keeps its AR pause — arriving early and sitting in the car is
      // real data, and pauses are not endpoint-filtered.
      {
        kind: 'pause',
        startTs: '2026-08-21T06:01:34.221Z',
        endTs: '2026-08-21T06:04:56.117Z',
        name: 'Easy Turku parkkipaikka',
      },
      // "Easy Turku" (saved:10, the office) is a different anchor from the
      // destination stop's (reusable:2, its parking lot), so it survives.
      {kind: 'passthrough', ts: '2026-08-21T06:05:45.193Z', name: 'Easy Turku'},
    ]);
  });

  it('derives the parkkipaikka fixture day, pausing rather than passing through', () => {
    const {stops, segments} = deriveFixture(fixtureParkkipaikka);

    expect(stops.map(stop => stop.anchor?.name ?? null)).toEqual([
      'Easy Turku parkkipaikka',
      null,
      null,
    ]);
    expect(segments).toHaveLength(4);

    // Home 05:39 → the Easy Turku parking lot 05:48. Both AR still spans are
    // pauses, and Home never doubles as a passthrough.
    const morning = segments[0];
    expect(morning.destinationStopKey).toBe(
      'reusable:2:2026-08-19T05:48:54.857Z',
    );
    expect(morning.via).toEqual([
      {
        kind: 'pause',
        startTs: '2026-08-19T05:42:39.078Z',
        endTs: '2026-08-19T05:45:32.145Z',
        name: 'Home',
      },
      {
        kind: 'pause',
        startTs: '2026-08-19T05:46:26.638Z',
        endTs: '2026-08-19T05:48:54.857Z',
        name: null,
      },
    ]);

    // The 08:16 → 09:01 working trip: a genuine mid-trip passthrough of an
    // anchor that is neither endpoint, plus an unnamed pause.
    expect(segments[1].via).toEqual([
      {
        kind: 'passthrough',
        ts: '2026-08-19T08:19:45.638Z',
        name: 'Tyks T-sairaala',
      },
      {
        kind: 'pause',
        startTs: '2026-08-19T08:36:20.586Z',
        endTs: '2026-08-19T08:44:43.755Z',
        name: null,
      },
    ]);
    expect(segments[1].stillSeconds).toBe(49);
  });

  it('emits a passthrough when the track crosses an anchor without pausing', () => {
    const kiosk = anchor(1, 'Kiosk', 1000, 60);
    const points = [
      p(0, 0, 0, 10),
      p(30, 1000, 0, 10), // inside Kiosk radius, moving
      p(60, 2000, 0, 10),
    ];
    const {segments} = deriveRouteDay(points, [kiosk], []);

    expect(segments[0].via).toEqual([
      {kind: 'passthrough', ts: points[1].timestamp, name: 'Kiosk'},
    ]);
  });
});
