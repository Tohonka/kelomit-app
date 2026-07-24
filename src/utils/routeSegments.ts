import {distanceMeters} from '../services/locationUtils';
import type {GpsPoint, RouteCoordinate} from '../types';

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

interface PointCluster {
  points: GpsPoint[];
  latitude: number;
  longitude: number;
}

interface ActiveAnchor extends PointCluster {
  anchor: RouteAnchor;
  key: string;
}

const UNKNOWN_RADIUS_M = 70;
const UNKNOWN_DWELL_SEC = 300;
const EXIT_RADIUS_MULTIPLIER = 1.25;

export function deriveRouteDay(
  points: GpsPoint[],
  anchors: RouteAnchor[],
): {stops: DerivedRouteStop[]; segments: DerivedRouteSegment[]} {
  const ordered = [...points].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const rawLastTs = ordered[ordered.length - 1]?.timestamp ?? '';
  const stops: DerivedRouteStop[] = [];
  const segments: DerivedRouteSegment[] = [];
  let movement: GpsPoint[] = [];
  let originStopKey: string | null = null;
  let unknown: PointCluster | null = null;
  let activeAnchor: ActiveAnchor | null = null;

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

  const flushUnknown = () => {
    if (!unknown) {
      return;
    }
    const first = unknown.points[0];
    const last = unknown.points[unknown.points.length - 1];
    if (secondsBetween(first, last) >= UNKNOWN_DWELL_SEC) {
      const stop: DerivedRouteStop = {
        key: `unknown:${first.timestamp}`,
        startTs: first.timestamp,
        endTs: last.timestamp,
        latitude: unknown.latitude,
        longitude: unknown.longitude,
        anchor: null,
      };
      movement.push(first);
      flushMovement(stop.key);
      stops.push(stop);
      originStopKey = stop.key;
    } else {
      movement.push(...unknown.points);
    }
    unknown = null;
  };

  const closeActiveAnchor = () => {
    if (!activeAnchor) {
      return;
    }
    const first = activeAnchor.points[0];
    const last = activeAnchor.points[activeAnchor.points.length - 1];
    stops.push({
      key: activeAnchor.key,
      startTs: first.timestamp,
      endTs: last.timestamp,
      latitude: activeAnchor.latitude,
      longitude: activeAnchor.longitude,
      anchor: activeAnchor.anchor,
    });
    originStopKey = activeAnchor.key;
    activeAnchor = null;
  };

  for (const point of ordered) {
    const entered = nearestAnchor(point, anchors);
    if (activeAnchor) {
      const activeDistance = distanceMeters(
        point.latitude,
        point.longitude,
        activeAnchor.anchor.latitude,
        activeAnchor.anchor.longitude,
      );
      const entersNearerAnchor =
        entered != null &&
        (entered.type !== activeAnchor.anchor.type ||
          entered.id !== activeAnchor.anchor.id) &&
        distanceMeters(
          point.latitude,
          point.longitude,
          entered.latitude,
          entered.longitude,
        ) < activeDistance;
      if (
        !entersNearerAnchor &&
        activeDistance <= activeAnchor.anchor.radiusM * EXIT_RADIUS_MULTIPLIER
      ) {
        extendCluster(activeAnchor, point);
        continue;
      }
      closeActiveAnchor();
    }

    if (entered) {
      flushUnknown();
      const key = `${entered.type}:${entered.id}:${point.timestamp}`;
      movement.push(point);
      flushMovement(key);
      activeAnchor = {
        anchor: entered,
        key,
        points: [point],
        latitude: point.latitude,
        longitude: point.longitude,
      };
      continue;
    }

    if (
      unknown &&
      distanceMeters(
        unknown.latitude,
        unknown.longitude,
        point.latitude,
        point.longitude,
      ) <= UNKNOWN_RADIUS_M
    ) {
      extendCluster(unknown, point);
    } else {
      flushUnknown();
      unknown = {
        points: [point],
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }
  }

  closeActiveAnchor();
  flushUnknown();
  flushMovement(null);
  return {stops, segments};
}

function nearestAnchor(
  point: GpsPoint,
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

function extendCluster(cluster: PointCluster, point: GpsPoint): void {
  const count = cluster.points.length + 1;
  cluster.latitude += (point.latitude - cluster.latitude) / count;
  cluster.longitude += (point.longitude - cluster.longitude) / count;
  cluster.points.push(point);
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
