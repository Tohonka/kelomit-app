import {
  getGpsDayIdsWithinRetention,
  getGpsPointsForDay,
} from '../db/gps';
import {getLocations} from '../db/locations';
import {
  getLatestDerivedRawTimestamp,
  getLatestRawTimestamp,
  getNamedPlaces,
  reconcileDayRouteHistory,
} from '../db/routeHistory';
import {deriveRouteDay, type RouteAnchor} from '../utils/routeSegments';
import {diag} from './diag';

const REFRESH_DELAY_MS = 15_000;
const refreshTimers = new Map<number, ReturnType<typeof setTimeout>>();
const activeRefreshes = new Map<
  number,
  {promise: Promise<void>; pending: boolean}
>();

async function refreshRouteDayOnce(dayId: number): Promise<void> {
  const [points, locations, namedPlaces] = await Promise.all([
    getGpsPointsForDay(dayId),
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
  await reconcileDayRouteHistory(dayId, deriveRouteDay(points, anchors));
}

export function refreshRouteDay(dayId: number): Promise<void> {
  const active = activeRefreshes.get(dayId);
  if (active) {
    active.pending = true;
    return active.promise;
  }

  const state = {promise: Promise.resolve(), pending: false};
  activeRefreshes.set(dayId, state);
  state.promise = (async () => {
    try {
      do {
        state.pending = false;
        await refreshRouteDayOnce(dayId);
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
  const [rawTimestamp, derivedTimestamp] = await Promise.all([
    getLatestRawTimestamp(dayId),
    getLatestDerivedRawTimestamp(dayId),
  ]);
  if (
    rawTimestamp === null ||
    (derivedTimestamp !== null && derivedTimestamp >= rawTimestamp)
  ) {
    return false;
  }
  await refreshRouteDay(dayId);
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

export async function reconcileRecentRouteDays(): Promise<void> {
  const dayIds = await getGpsDayIdsWithinRetention();
  await Promise.all(dayIds.map(dayId => refreshRouteDayIfStale(dayId)));
}
