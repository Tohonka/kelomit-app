import type {
  ActivityEvent,
  ActivityKind,
  ModeSpan,
  RouteCoordinate,
  TripMode,
} from '../types';

const MODE_BY_ACTIVITY: Record<ActivityKind, TripMode> = {
  vehicle: 'vehicle',
  walking: 'foot',
  running: 'foot',
  on_foot: 'foot',
  bicycle: 'cycle',
  still: 'still',
};

/** Spans shorter than this are AR transition noise; absorb into the neighbour. */
const MIN_SPAN_MS = 15_000;

export interface ActivityInterval {
  activity: ActivityKind;
  startMs: number;
  endMs: number;
}

/** Pair enter/exit events per activity into closed intervals; an enter with no
 *  exit closes at throughMs. Events must not be assumed sorted. */
export function activityIntervals(
  events: ActivityEvent[],
  throughMs: number,
): ActivityInterval[] {
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const open = new Map<ActivityKind, number>();
  const intervals: ActivityInterval[] = [];
  for (const event of ordered) {
    const ms = Date.parse(event.timestamp);
    if (event.transition === 'enter') {
      if (!open.has(event.activity)) {
        open.set(event.activity, ms);
      }
      continue;
    }
    const startMs = open.get(event.activity);
    if (startMs != null) {
      open.delete(event.activity);
      if (ms > startMs) {
        intervals.push({activity: event.activity, startMs, endMs: ms});
      }
    }
  }
  for (const [activity, startMs] of open) {
    if (throughMs > startMs) {
      intervals.push({activity, startMs, endMs: throughMs});
    }
  }
  return intervals.sort((a, b) => a.startMs - b.startMs);
}

/** Clip activity intervals to [startTs, endTs], map to trip modes, fill gaps
 *  with 'unknown', merge neighbours. Returns [] when nothing overlaps. */
export function buildModeSpans(
  events: ActivityEvent[],
  startTs: string,
  endTs: string,
): ModeSpan[] {
  const startMs = Date.parse(startTs);
  const endMs = Date.parse(endTs);
  const clipped = activityIntervals(events, endMs)
    .map(interval => ({
      mode: MODE_BY_ACTIVITY[interval.activity],
      startMs: Math.max(interval.startMs, startMs),
      endMs: Math.min(interval.endMs, endMs),
    }))
    .filter(span => span.endMs > span.startMs);
  if (clipped.length === 0) {
    return [];
  }

  // Fill gaps (AR off / journal gap) with 'unknown'.
  const filled: Array<{mode: TripMode; startMs: number; endMs: number}> = [];
  let cursor = startMs;
  for (const span of clipped) {
    if (span.startMs > cursor) {
      filled.push({mode: 'unknown', startMs: cursor, endMs: span.startMs});
    }
    filled.push(span);
    cursor = Math.max(cursor, span.endMs);
  }
  if (cursor < endMs) {
    filled.push({mode: 'unknown', startMs: cursor, endMs});
  }

  // Absorb sub-15s spans into the previous span (or the next, when first),
  // then merge same-mode neighbours.
  const merged: typeof filled = [];
  for (const span of filled) {
    const previous = merged[merged.length - 1];
    if (previous && span.endMs - span.startMs < MIN_SPAN_MS) {
      previous.endMs = span.endMs;
      continue;
    }
    if (previous && previous.endMs - previous.startMs < MIN_SPAN_MS) {
      // First span was a blip: give it to the current one.
      span.startMs = previous.startMs;
      merged.pop();
    }
    if (merged.length > 0 && merged[merged.length - 1].mode === span.mode) {
      merged[merged.length - 1].endMs = span.endMs;
    } else {
      merged.push({...span});
    }
  }

  return merged.map(span => ({
    mode: span.mode,
    startTs: new Date(span.startMs).toISOString(),
    endTs: new Date(span.endMs).toISOString(),
  }));
}

/** Seconds per mode across the spans. */
export function aggregateModeDurations(
  spans: ModeSpan[],
): Partial<Record<TripMode, number>> {
  const totals: Partial<Record<TripMode, number>> = {};
  for (const span of spans) {
    const seconds = (Date.parse(span.endTs) - Date.parse(span.startTs)) / 1000;
    totals[span.mode] = (totals[span.mode] ?? 0) + seconds;
  }
  return totals;
}

/** Split a timestamped coordinate list into per-mode polyline slices. Each leg
 *  [i-1, i] belongs to the span containing its midpoint; the boundary point is
 *  duplicated so consecutive slices connect visually. Coordinates without `t`
 *  (pre-v25 rows) or empty spans yield one 'unknown' (solid) slice. */
export function sliceByModeSpans(
  coordinates: RouteCoordinate[],
  spans: ModeSpan[] | null,
): Array<{mode: TripMode; coordinates: RouteCoordinate[]}> {
  if (
    coordinates.length < 2 ||
    !spans ||
    spans.length === 0 ||
    coordinates.some(coordinate => coordinate.t == null)
  ) {
    return [{mode: 'unknown', coordinates}];
  }
  const parsed = spans.map(span => ({
    mode: span.mode,
    startMs: Date.parse(span.startTs),
    endMs: Date.parse(span.endTs),
  }));
  const modeAt = (ms: number): TripMode => {
    for (const span of parsed) {
      if (ms >= span.startMs && ms < span.endMs) {
        return span.mode;
      }
    }
    return 'unknown';
  };

  const slices: Array<{mode: TripMode; coordinates: RouteCoordinate[]}> = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const point = coordinates[index];
    const mode = modeAt(((previous.t as number) + (point.t as number)) / 2);
    const current = slices[slices.length - 1];
    if (current && current.mode === mode) {
      current.coordinates.push(point);
    } else {
      slices.push({mode, coordinates: [previous, point]});
    }
  }
  return slices;
}
