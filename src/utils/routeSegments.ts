import {distanceMeters} from '../services/locationUtils';
import type {
  ActivityEvent,
  GpsPoint,
  ModeSpan,
  RouteCoordinate,
  TripVia,
} from '../types';
import {activityIntervals, buildModeSpans} from './tripModes';

export interface RouteAnchor {
  id: number;
  type: 'saved' | 'reusable';
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export interface DerivedRouteStop {
  key: string;
  startTs: string;
  endTs: string;
  latitude: number;
  longitude: number;
  anchor: RouteAnchor | null;
}

export interface DerivedRouteSegment {
  sequence: number;
  startTs: string;
  endTs: string;
  originStopKey: string | null;
  destinationStopKey: string | null;
  coordinates: RouteCoordinate[];
  distanceM: number;
  durationSec: number;
  averageSpeedMps: number;
  maximumSpeedMps: number;
  rawLastTs: string;
  modeSpans: ModeSpan[];
  stillSeconds: number;
  via: TripVia[];
}

interface StopRange {
  start: number;
  end: number;
}

const STOP_WINDOW_MS = 5 * 60_000;
const STOP_RADIUS_M = 150;
const GO_SPEED_MPS = 3;
const GO_SPEED_FIXES = 2;
// ponytail: 70 m/s rejects clear GPS spikes; make transport-specific only if
// collected real routes show this ceiling hides legitimate data.
const MAX_PLAUSIBLE_SPEED_MPS = 70;
/** Fixes at/below this speed count as "not moving" (traffic lights, jams). */
const STILL_SPEED_MPS = 0.7;
/** A slow-fix gap longer than this is a sampling hole, not stillness. */
const STILL_GAP_CAP_SEC = 120;
/** AR still-span length that surfaces as a mid-trip "pause" in via. */
const PAUSE_MIN_MS = 120_000;

export function filteredMaximumSpeedMps(
  recordedSpeeds: number[],
  fallbackLegSpeedMps: number,
): number {
  const valid = recordedSpeeds.filter(
    speed =>
      Number.isFinite(speed) &&
      speed >= 0 &&
      speed <= MAX_PLAUSIBLE_SPEED_MPS,
  );
  if (valid.length === 0) return fallbackLegSpeedMps;
  if (valid.length < 3) return Math.max(...valid);
  let maximum = 0;
  for (let index = 1; index < valid.length - 1; index += 1) {
    const median = [valid[index - 1], valid[index], valid[index + 1]]
      .sort((left, right) => left - right)[1];
    maximum = Math.max(maximum, median);
  }
  return maximum;
}

export function deriveRouteDay(
  points: GpsPoint[],
  anchors: RouteAnchor[],
  activityEvents: ActivityEvent[] = [],
): {stops: DerivedRouteStop[]; segments: DerivedRouteSegment[]} {
  const ordered = [...points].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const rawLastTs = ordered[ordered.length - 1]?.timestamp ?? '';
  const ranges = findStopRanges(
    ordered,
    vehicleStateAtPoints(ordered, activityEvents),
  );
  const stops: DerivedRouteStop[] = [];
  const segments: DerivedRouteSegment[] = [];
  let movement: GpsPoint[] = [];
  let originStopKey: string | null = null;
  let cursor = 0;

  const flushMovement = (destinationStopKey: string | null) => {
    if (movement.length >= 2) {
      segments.push(
        makeSegment(
          movement,
          segments.length,
          originStopKey,
          destinationStopKey,
          rawLastTs,
          anchors,
          activityEvents,
        ),
      );
    }
    movement = [];
  };

  for (const range of ranges) {
    const dwell = ordered.slice(range.start, range.end + 1);
    const center = centroid(dwell);
    const anchor = nearestAnchor(center, anchors);
    const first = dwell[0];
    const last = dwell[dwell.length - 1];
    const key = anchor
      ? `${anchor.type}:${anchor.id}:${first.timestamp}`
      : `unknown:${first.timestamp}`;
    movement.push(...ordered.slice(cursor, range.start + 1));
    flushMovement(key);
    stops.push({
      key,
      startTs: first.timestamp,
      endTs: last.timestamp,
      latitude: center.latitude,
      longitude: center.longitude,
      anchor,
    });
    originStopKey = key;
    cursor = range.end + 1;
  }

  movement.push(...ordered.slice(cursor));
  flushMovement(null);
  return {stops, segments};
}

function nearestAnchor(
  point: {latitude: number; longitude: number},
  anchors: RouteAnchor[],
): RouteAnchor | null {
  let best: {anchor: RouteAnchor; distance: number} | null = null;
  for (const candidate of anchors) {
    const distance = distanceMeters(
      point.latitude,
      point.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    if (distance <= candidate.radiusM && (!best || distance < best.distance)) {
      best = {anchor: candidate, distance};
    }
  }
  return best?.anchor ?? null;
}

function vehicleStateAtPoints(
  points: GpsPoint[],
  events: ActivityEvent[],
): boolean[] {
  const ordered = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  let cursor = 0;
  let inVehicle = false;
  return points.map(point => {
    while (
      cursor < ordered.length &&
      Date.parse(ordered[cursor].timestamp) <= Date.parse(point.timestamp)
    ) {
      const event = ordered[cursor++];
      if (event.activity === 'vehicle') {
        inVehicle = event.transition === 'enter';
      }
    }
    return inVehicle;
  });
}

function findStopRanges(
  points: GpsPoint[],
  vehicleAtPoint: boolean[],
): StopRange[] {
  const ranges: StopRange[] = [];
  let scanStart = 0;
  let confirmedStart: number | null = null;
  let lastContained = -1;
  let fastStart: number | null = null;
  let index = 0;

  while (index < points.length) {
    if (vehicleAtPoint[index]) {
      if (confirmedStart != null && index > confirmedStart) {
        ranges.push({start: confirmedStart, end: index - 1});
      }
      confirmedStart = null;
      lastContained = -1;
      fastStart = null;
      scanStart = index + 1;
      index += 1;
      continue;
    }

    const speed = points[index].speed;
    const isFast =
      speed != null && Number.isFinite(speed) && speed >= GO_SPEED_MPS;
    if (isFast) {
      fastStart ??= index;
      if (index - fastStart + 1 >= GO_SPEED_FIXES) {
        if (confirmedStart != null && fastStart > confirmedStart) {
          ranges.push({start: confirmedStart, end: fastStart - 1});
        }
        confirmedStart = null;
        lastContained = -1;
        fastStart = null;
        scanStart = index + 1;
        index += 1;
        continue;
      }
    } else {
      fastStart = null;
    }

    if (confirmedStart != null) {
      const suffixStart = narrowestWindowStart(points, confirmedStart, index);
      if (
        suffixStart != null &&
        isCompact(points.slice(suffixStart, index + 1))
      ) {
        lastContained = index;
        index += 1;
        continue;
      }

      ranges.push({start: confirmedStart, end: lastContained});
      scanStart = lastContained + 1;
      confirmedStart = null;
      lastContained = -1;
      fastStart = null;
      index = scanStart;
      continue;
    }

    const suffixStart = narrowestWindowStart(points, scanStart, index);
    if (
      suffixStart != null &&
      isCompact(points.slice(suffixStart, index + 1))
    ) {
      confirmedStart = suffixStart;
      lastContained = index;
    }
    index += 1;
  }

  if (confirmedStart != null) {
    ranges.push({start: confirmedStart, end: lastContained});
  }
  return ranges;
}

function narrowestWindowStart(
  points: GpsPoint[],
  floor: number,
  end: number,
): number | null {
  const endMs = Date.parse(points[end].timestamp);
  for (let start = end - 1; start >= floor; start -= 1) {
    if (endMs - Date.parse(points[start].timestamp) >= STOP_WINDOW_MS) {
      return start;
    }
  }
  return null;
}

function isCompact(points: GpsPoint[]): boolean {
  const center = centroid(points);
  return points.every(point =>
    distanceMeters(
      center.latitude,
      center.longitude,
      point.latitude,
      point.longitude,
    ) <= STOP_RADIUS_M + Math.max(0, point.accuracy ?? 0),
  );
}

function centroid(
  points: Array<{latitude: number; longitude: number}>,
): {latitude: number; longitude: number} {
  const sum = points.reduce(
    (result, point) => ({
      latitude: result.latitude + point.latitude,
      longitude: result.longitude + point.longitude,
    }),
    {latitude: 0, longitude: 0},
  );
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}

function secondsBetween(first: GpsPoint, last: GpsPoint): number {
  return (Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 1000;
}

function makeSegment(
  points: GpsPoint[],
  sequence: number,
  originStopKey: string | null,
  destinationStopKey: string | null,
  rawLastTs: string,
  anchors: RouteAnchor[],
  activityEvents: ActivityEvent[],
): DerivedRouteSegment {
  let distanceM = 0;
  let maximumLegSpeedMps = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const legDistance = distanceMeters(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude,
    );
    const legDurationSec = secondsBetween(previous, point);
    distanceM += legDistance;
    if (legDurationSec > 0) {
      maximumLegSpeedMps = Math.max(
        maximumLegSpeedMps,
        legDistance / legDurationSec,
      );
    }
  }
  const durationSec = Math.max(
    0,
    Math.round(secondsBetween(points[0], points[points.length - 1])),
  );
  const recordedSpeeds = points
    .map(point => point.speed)
    .filter((speed): speed is number => speed != null);

  const startTs = points[0].timestamp;
  const endTs = points[points.length - 1].timestamp;

  let stillSeconds = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].speed;
    const current = points[index].speed;
    if (
      previous != null &&
      current != null &&
      previous < STILL_SPEED_MPS &&
      current < STILL_SPEED_MPS
    ) {
      stillSeconds += Math.min(
        secondsBetween(points[index - 1], points[index]),
        STILL_GAP_CAP_SEC,
      );
    }
  }

  return {
    sequence,
    startTs,
    endTs,
    originStopKey,
    destinationStopKey,
    coordinates: points.map(({latitude, longitude, timestamp}) => ({
      latitude,
      longitude,
      t: Date.parse(timestamp),
    })),
    distanceM,
    durationSec,
    averageSpeedMps: durationSec > 0 ? distanceM / durationSec : 0,
    maximumSpeedMps: filteredMaximumSpeedMps(
      recordedSpeeds,
      maximumLegSpeedMps,
    ),
    rawLastTs,
    modeSpans: buildModeSpans(activityEvents, startTs, endTs),
    stillSeconds: Math.round(stillSeconds),
    via: buildVia(points, anchors, activityEvents, [
      originStopKey,
      destinationStopKey,
    ]),
  };
}

const anchorKey = (anchor: RouteAnchor): string =>
  `${anchor.type}:${anchor.id}`;

/** `${type}:${id}` out of a stop key (`${type}:${id}:${ts}`, or `unknown:${ts}`
 *  for a stop no anchor covers). */
function stopAnchorKey(stopKey: string | null): string | null {
  const [type, id] = stopKey?.split(':') ?? [];
  return type === 'saved' || type === 'reusable' ? `${type}:${id}` : null;
}

/** Mid-trip waypoints: AR still-spans of >= 2 min become "pause" entries named
 *  by the anchor around the nearest-in-time fix; every other anchor the track
 *  passes through becomes one "passthrough". Sorted by time. */
function buildVia(
  points: GpsPoint[],
  anchors: RouteAnchor[],
  activityEvents: ActivityEvent[],
  endpointStopKeys: Array<string | null>,
): TripVia[] {
  const startMs = Date.parse(points[0].timestamp);
  const endMs = Date.parse(points[points.length - 1].timestamp);
  const via: TripVia[] = [];
  const pausedAnchors = new Set<string>();

  for (const interval of activityIntervals(activityEvents, endMs)) {
    if (interval.activity !== 'still') continue;
    const spanStart = Math.max(interval.startMs, startMs);
    const spanEnd = Math.min(interval.endMs, endMs);
    if (spanEnd - spanStart < PAUSE_MIN_MS) continue;
    const midMs = (spanStart + spanEnd) / 2;
    const nearest = points.reduce((best, point) =>
      Math.abs(Date.parse(point.timestamp) - midMs) <
      Math.abs(Date.parse(best.timestamp) - midMs)
        ? point
        : best,
    );
    const anchor = nearestAnchor(nearest, anchors);
    if (anchor) pausedAnchors.add(anchorKey(anchor));
    via.push({
      kind: 'pause',
      startTs: new Date(spanStart).toISOString(),
      endTs: new Date(spanEnd).toISOString(),
      name: anchor?.name ?? null,
    });
  }

  // Passthroughs: first fix inside an anchor's radius, one per anchor, skipping
  // anchors already credited with a pause and the trip's own endpoint anchors —
  // those are its stops, not waypoints along the way.
  const seenAnchors = new Set<string>(pausedAnchors);
  for (const stopKey of endpointStopKeys) {
    const key = stopAnchorKey(stopKey);
    if (key) seenAnchors.add(key);
  }
  for (const point of points) {
    for (const anchor of anchors) {
      const key = anchorKey(anchor);
      if (seenAnchors.has(key)) continue;
      if (
        distanceMeters(
          point.latitude,
          point.longitude,
          anchor.latitude,
          anchor.longitude,
        ) <= anchor.radiusM
      ) {
        seenAnchors.add(key);
        via.push({kind: 'passthrough', ts: point.timestamp, name: anchor.name});
      }
    }
  }

  return via.sort((a, b) => {
    const left = a.kind === 'pause' ? a.startTs : a.ts;
    const right = b.kind === 'pause' ? b.startTs : b.ts;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
