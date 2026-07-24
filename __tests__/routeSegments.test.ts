import {deriveRouteDay, type RouteAnchor} from '../src/utils/routeSegments';
import type {GpsPoint} from '../src/types';

const METRES_PER_DEGREE = 111194.9266;
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
  it('splits a short known-place stop at both boundaries', () => {
    const office = anchor(1, 'Office', 0, 50);
    const yard = anchor(2, 'Training Yard', 1000, 50);
    const out = deriveRouteDay(
      [
        p(0, 0),
        p(10, 100),
        p(40, 500),
        p(60, 1000),
        p(240, 1000),
        p(250, 900),
        p(300, 500),
        p(360, 0),
      ],
      [office, yard],
    );

    const yardStop = out.stops.find(stop => stop.anchor?.id === yard.id);
    expect(out.segments).toHaveLength(2);
    expect(yardStop).toMatchObject({
      startTs: p(60, 1000).timestamp,
      endTs: p(240, 1000).timestamp,
    });
    expect(out.segments[0].destinationStopKey).toBe(yardStop?.key);
    expect(out.segments[1].originStopKey).toBe(yardStop?.key);
  });

  it('keeps a 299-second unknown cluster in one trip', () => {
    const out = deriveRouteDay(
      [
        p(0, 0),
        p(50, 500),
        p(100, 1000),
        p(399, 1000),
        p(410, 1500),
        p(460, 2000),
      ],
      [],
    );

    expect(out.stops).toEqual([]);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].coordinates).toHaveLength(6);
  });

  it('splits a 300-second unknown cluster at its first point', () => {
    const out = deriveRouteDay(
      [
        p(0, 0),
        p(50, 500),
        p(100, 1000),
        p(400, 1000),
        p(450, 1500),
        p(500, 2000),
      ],
      [],
    );

    expect(out.stops).toHaveLength(1);
    expect(out.stops[0]).toMatchObject({
      startTs: p(100, 1000).timestamp,
      endTs: p(400, 1000).timestamp,
      anchor: null,
    });
    expect(out.segments).toHaveLength(2);
    expect(out.segments[0].coordinates).toEqual([
      {latitude: p(0, 0).latitude, longitude: 0},
      {latitude: p(50, 500).latitude, longitude: 0},
    ]);
    expect(out.segments[0].destinationStopKey).toBe(out.stops[0].key);
    expect(out.segments[1].originStopKey).toBe(out.stops[0].key);
  });

  it.each(['saved', 'reusable'] as const)(
    'uses entry radius and 1.25 exit hysteresis for a %s anchor',
    type => {
      const place = anchor(1, 'Place', 0, 100, type);
      const out = deriveRouteDay(
        [p(0, 200), p(10, 101), p(20, 99), p(30, 110), p(40, 126), p(50, 200)],
        [place],
      );

      expect(out.stops).toHaveLength(1);
      expect(out.stops[0]).toMatchObject({
        startTs: p(20, 99).timestamp,
        endTs: p(30, 110).timestamp,
        anchor: place,
      });
      expect(out.segments).toHaveLength(2);
      expect(out.segments[0].coordinates.map(point => point.latitude)).toEqual([
        p(0, 200).latitude,
        p(10, 101).latitude,
      ]);
      expect(out.segments[1].coordinates.map(point => point.latitude)).toEqual([
        p(40, 126).latitude,
        p(50, 200).latitude,
      ]);
    },
  );

  it('selects the nearest center when anchor entry radii overlap', () => {
    const farther = anchor(1, 'Farther', 0, 100);
    const nearer = anchor(2, 'Nearer', 20, 100, 'reusable');

    const out = deriveRouteDay([p(0, 18)], [farther, nearer]);

    expect(out.stops).toHaveLength(1);
    expect(out.stops[0].anchor).toBe(nearer);
  });

  it('omits every point recorded inside an anchor from segment geometry', () => {
    const place = anchor(1, 'Place', 0, 50);
    const out = deriveRouteDay(
      [p(0, 200), p(10, 100), p(20, 10), p(30, -10), p(40, 100), p(50, 200)],
      [place],
    );

    expect(out.segments).toHaveLength(2);
    expect(
      out.segments.flatMap(segment =>
        segment.coordinates.map(point =>
          Math.round(point.latitude * METRES_PER_DEGREE),
        ),
      ),
    ).toEqual([200, 100, 100, 200]);
  });

  it('does not create a boundary for a GPS time gap without spatial dwell', () => {
    const out = deriveRouteDay(
      [p(0, 0), p(10, 500), p(3600, 1000), p(3610, 1500)],
      [],
    );

    expect(out.stops).toEqual([]);
    expect(out.segments).toHaveLength(1);
  });

  it('emits a partial route with a null origin', () => {
    const destination = anchor(1, 'Destination', 1000, 50);
    const out = deriveRouteDay(
      [p(0, 0), p(50, 500), p(100, 1000)],
      [destination],
    );

    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].originStopKey).toBeNull();
    expect(out.segments[0].destinationStopKey).toBe(out.stops[0].key);
  });

  it('emits a partial route with a null destination', () => {
    const origin = anchor(1, 'Origin', 0, 50);
    const out = deriveRouteDay([p(0, 0), p(50, 500), p(100, 1000)], [origin]);

    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].originStopKey).toBe(out.stops[0].key);
    expect(out.segments[0].destinationStopKey).toBeNull();
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
