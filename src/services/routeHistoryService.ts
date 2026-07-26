import {
  getGpsDayIdsWithinRetention,
  getGpsPointsForDay,
} from '../db/gps';
import {getActivityEventsThrough} from '../db/activityEvents';
import {getLocations} from '../db/locations';
import {
  getEarliestDerivedTimestamp,
  getLatestDerivedRawTimestamp,
  getLatestRawTimestamp,
  getNamedPlaces,
  hasInvalidRouteGeometry,
  reconcileDayRouteHistory,
} from '../db/routeHistory';
import {deriveRouteDay, type RouteAnchor} from '../utils/routeSegments';
import {diag} from './diag';

const REFRESH_DELAY_MS = 15_000;
const refreshTimers = new Map<number, ReturnType<typeof setTimeout>>();
const activeRefreshes = new Map<
  number,
  {
    promise: Promise<void>;
    pending: boolean;
    repairInvalidGeometry: boolean;
    force: boolean;
  }
>();

export interface RouteRefreshOptions {
  repairInvalidGeometry?: boolean;
  force?: boolean;
}

async function refreshRouteDayOnce(
  dayId: number,
  options: RouteRefreshOptions,
): Promise<void> {
  const [points, persistedFirstTs, persistedRawLastTs] = await Promise.all([
    getGpsPointsForDay(dayId),
    getEarliestDerivedTimestamp(dayId),
    getLatestDerivedRawTimestamp(dayId),
  ]);
  const sourceFirstTs = points[0]?.timestamp;
  const sourceRawLastTs = points[points.length - 1]?.timestamp;
  if (
    sourceFirstTs == null ||
    sourceRawLastTs == null ||
    (persistedFirstTs !== null && sourceFirstTs > persistedFirstTs) ||
    (persistedRawLastTs !== null &&
      (sourceRawLastTs < persistedRawLastTs ||
        (!options.force &&
          !options.repairInvalidGeometry &&
          sourceRawLastTs === persistedRawLastTs)))
  ) {
    return;
  }
  const [activityEvents, locations, namedPlaces] = await Promise.all([
    getActivityEventsThrough(sourceRawLastTs),
    getLocations(),
    getNamedPlaces(),
  ]);
  const anchors: RouteAnchor[] = [
    ...locations.map(location => ({
      id: location.id,
      type: 'saved' as const,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: location.radius_m,
    })),
    ...namedPlaces.map(place => ({
      id: place.id,
      type: 'reusable' as const,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      radiusM: place.radius_m,
    })),
  ];
  await reconcileDayRouteHistory(
    dayId,
    deriveRouteDay(points, anchors, activityEvents),
  );
}

export function refreshRouteDay(
  dayId: number,
  options: RouteRefreshOptions = {},
): Promise<void> {
  const active = activeRefreshes.get(dayId);
  if (active) {
    active.pending = true;
    active.repairInvalidGeometry ||= options.repairInvalidGeometry ?? false;
    active.force ||= options.force ?? false;
    return active.promise;
  }

  const state = {
    promise: Promise.resolve(),
    pending: false,
    repairInvalidGeometry: options.repairInvalidGeometry ?? false,
    force: options.force ?? false,
  };
  activeRefreshes.set(dayId, state);
  state.promise = (async () => {
    try {
      do {
        state.pending = false;
        const repair = state.repairInvalidGeometry;
        const force = state.force;
        state.repairInvalidGeometry = false;
        state.force = false;
        await refreshRouteDayOnce(dayId, {
          repairInvalidGeometry: repair,
          force,
        });
      } while (state.pending);
    } finally {
      activeRefreshes.delete(dayId);
    }
  })();
  return state.promise;
}

export async function refreshRouteDayIfStale(
  dayId: number,
): Promise<boolean> {
  const [rawTimestamp, derivedTimestamp, invalidGeometry] = await Promise.all([
    getLatestRawTimestamp(dayId),
    getLatestDerivedRawTimestamp(dayId),
    hasInvalidRouteGeometry(dayId),
  ]);
  if (
    rawTimestamp === null ||
    (!invalidGeometry &&
      derivedTimestamp !== null &&
      derivedTimestamp >= rawTimestamp)
  ) {
    return false;
  }
  await refreshRouteDay(dayId, {repairInvalidGeometry: invalidGeometry});
  return true;
}

export function scheduleRouteRefresh(dayId: number): void {
  const previous = refreshTimers.get(dayId);
  if (previous) {
    clearTimeout(previous);
  }
  refreshTimers.set(
    dayId,
    setTimeout(() => {
      refreshTimers.delete(dayId);
      refreshRouteDay(dayId).catch(error => {
        diag('route.refresh.fail', String(error), {dayId});
      });
    }, REFRESH_DELAY_MS),
  );
}

export async function reconcileRecentRouteDays(force = false): Promise<void> {
  const dayIds = await getGpsDayIdsWithinRetention();
  await Promise.all(
    dayIds.map(dayId =>
      force
        ? refreshRouteDay(dayId, {force: true})
        : refreshRouteDayIfStale(dayId),
    ),
  );
}
