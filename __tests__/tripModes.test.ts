import {
  activityIntervals,
  aggregateModeDurations,
  buildModeSpans,
  sliceByModeSpans,
} from '../src/utils/tripModes';
import type {ActivityEvent, RouteCoordinate} from '../src/types';

const T0 = Date.parse('2026-08-21T12:00:00.000Z');
const iso = (offsetSec: number) => new Date(T0 + offsetSec * 1000).toISOString();
const ev = (activity: ActivityEvent['activity'], transition: 'enter' | 'exit', offsetSec: number): ActivityEvent =>
  ({activity, transition, timestamp: iso(offsetSec)});

describe('activityIntervals', () => {
  it('pairs enter/exit and closes an open enter at throughMs', () => {
    const intervals = activityIntervals(
      [ev('vehicle', 'enter', 0), ev('vehicle', 'exit', 600), ev('walking', 'enter', 600)],
      T0 + 900_000,
    );
    expect(intervals).toEqual([
      {activity: 'vehicle', startMs: T0, endMs: T0 + 600_000},
      {activity: 'walking', startMs: T0 + 600_000, endMs: T0 + 900_000},
    ]);
  });
});

describe('buildModeSpans', () => {
  it('clips to the trip window, maps activities to modes, fills gaps with unknown', () => {
    const spans = buildModeSpans(
      [ev('vehicle', 'enter', -60), ev('vehicle', 'exit', 300), ev('walking', 'enter', 400), ev('walking', 'exit', 600)],
      iso(0),
      iso(600),
    );
    expect(spans).toEqual([
      {mode: 'vehicle', startTs: iso(0), endTs: iso(300)},
      {mode: 'unknown', startTs: iso(300), endTs: iso(400)},
      {mode: 'foot', startTs: iso(400), endTs: iso(600)},
    ]);
  });

  it('merges same-mode neighbours and absorbs sub-15s spans', () => {
    const spans = buildModeSpans(
      [
        ev('walking', 'enter', 0), ev('walking', 'exit', 100),
        ev('still', 'enter', 100), ev('still', 'exit', 110), // 10 s blip
        ev('running', 'enter', 110), ev('running', 'exit', 200),
      ],
      iso(0),
      iso(200),
    );
    expect(spans).toEqual([{mode: 'foot', startTs: iso(0), endTs: iso(200)}]);
  });

  it('returns [] when no events overlap the window', () => {
    expect(buildModeSpans([], iso(0), iso(600))).toEqual([]);
  });

  it('resolves overlapping intervals from dropped AR exits: newer enter supersedes stale open span', () => {
    // vehicle enters but never exits → will be closed at throughMs (900s)
    // walking enters at 600 and exits at 900 → overlaps vehicle from 600-900
    // walking should win the 600-900 region; vehicle truncated to 600
    const spans = buildModeSpans(
      [ev('vehicle', 'enter', 0), ev('walking', 'enter', 600), ev('walking', 'exit', 900)],
      iso(0),
      iso(900),
    );
    expect(spans).toEqual([
      {mode: 'vehicle', startTs: iso(0), endTs: iso(600)},
      {mode: 'foot', startTs: iso(600), endTs: iso(900)},
    ]);
  });

  it('produces deterministic result regardless of event order', () => {
    // Same events, different order
    const ordered = [ev('vehicle', 'enter', 0), ev('vehicle', 'exit', 300), ev('walking', 'enter', 400), ev('walking', 'exit', 600)];
    const unordered = [ev('walking', 'exit', 600), ev('vehicle', 'enter', 0), ev('walking', 'enter', 400), ev('vehicle', 'exit', 300)];
    const spansOrdered = buildModeSpans(ordered, iso(0), iso(600));
    const spansUnordered = buildModeSpans(unordered, iso(0), iso(600));
    expect(spansUnordered).toEqual(spansOrdered);
  });

  it('ignores exit events without matching enter', () => {
    const spans = buildModeSpans(
      [ev('vehicle', 'exit', 300), ev('walking', 'enter', 400), ev('walking', 'exit', 600)],
      iso(0),
      iso(600),
    );
    expect(spans).toEqual([
      {mode: 'unknown', startTs: iso(0), endTs: iso(400)},
      {mode: 'foot', startTs: iso(400), endTs: iso(600)},
    ]);
  });

  it('absorbs leading sub-15s blip into following span', () => {
    const spans = buildModeSpans(
      [ev('still', 'enter', 0), ev('still', 'exit', 10), ev('vehicle', 'enter', 10), ev('vehicle', 'exit', 200)],
      iso(0),
      iso(200),
    );
    expect(spans).toEqual([{mode: 'vehicle', startTs: iso(0), endTs: iso(200)}]);
  });
});

describe('aggregateModeDurations', () => {
  it('sums seconds per mode', () => {
    expect(
      aggregateModeDurations([
        {mode: 'vehicle', startTs: iso(0), endTs: iso(300)},
        {mode: 'foot', startTs: iso(300), endTs: iso(360)},
        {mode: 'vehicle', startTs: iso(360), endTs: iso(400)},
      ]),
    ).toEqual({vehicle: 340, foot: 60});
  });
});

describe('sliceByModeSpans', () => {
  const coord = (offsetSec: number, lat: number): RouteCoordinate =>
    ({latitude: lat, longitude: 22, t: T0 + offsetSec * 1000});

  it('splits legs at span boundaries, duplicating the boundary point', () => {
    const coords = [coord(0, 60.0), coord(100, 60.1), coord(200, 60.2), coord(300, 60.3)];
    const slices = sliceByModeSpans(coords, [
      {mode: 'vehicle', startTs: iso(0), endTs: iso(150)},
      {mode: 'foot', startTs: iso(150), endTs: iso(300)},
    ]);
    expect(slices.map(s => s.mode)).toEqual(['vehicle', 'foot']);
    expect(slices[0].coordinates).toEqual([coords[0], coords[1]]);
    expect(slices[1].coordinates).toEqual([coords[1], coords[2], coords[3]]);
  });

  it('falls back to one unknown slice without timestamps or spans', () => {
    const legacy = [{latitude: 60, longitude: 22}, {latitude: 61, longitude: 22}];
    expect(sliceByModeSpans(legacy, null)).toEqual([{mode: 'unknown', coordinates: legacy}]);
    expect(sliceByModeSpans(legacy, [])).toEqual([{mode: 'unknown', coordinates: legacy}]);
  });
});
