import {distanceMeters} from '../services/locationUtils';
import type {ActivityEvent, GpsPoint, RouteCoordinate} from '../types';

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
}

interface StopRange {
  start: number;
  end: number;
}

const STOP_WINDOW_MS = 5 * 60_000;
const STOP_RADIUS_M = 150;
const GO_SPEED_MPS = 3;
const GO_SPEED_FIXES = 2;

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
    .filter(
      (speed): speed is number =>
        speed != null && Number.isFinite(speed) && speed >= 0,
    );

  return {
    sequence,
    startTs: points[0].timestamp,
    endTs: points[points.length - 1].timestamp,
    originStopKey,
    destinationStopKey,
    coordinates: points.map(({latitude, longitude}) => ({
      latitude,
      longitude,
    })),
    distanceM,
    durationSec,
    averageSpeedMps: durationSec > 0 ? distanceM / durationSec : 0,
    maximumSpeedMps:
      recordedSpeeds.length > 0
        ? Math.max(...recordedSpeeds)
        : maximumLegSpeedMps,
    rawLastTs,
  };
}
