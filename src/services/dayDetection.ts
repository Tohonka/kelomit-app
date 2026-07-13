import {format} from 'date-fns';
import {getLocations} from '../db/locations';
import {getOrCreateDay, updateDay} from '../db/days';
import {createDayEndConfirmation} from '../db/dayConfirmations';
import {displayDayEndConfirmation} from './notificationService';
import {inferDay} from './endOfDay';
import {recordCrossing, crossingsForDay} from './crossingStore';
import {
  monitorPlaces,
  subscribeGeofenceCrossing,
  type CrossingEvent,
} from '../native/backgroundLocation';
import type {SavedLocation} from '../types';

let _sub: {remove: () => void} | null = null;
let _locations: SavedLocation[] = [];

async function loadLocations(): Promise<void> {
  try {
    _locations = await getLocations();
  } catch {
    _locations = [];
  }
}

function kindOf(locationId: number): 'work' | 'home' | 'other' {
  const loc = _locations.find(l => l.id === locationId);
  const k = loc?.kind;
  return k === 'work' || k === 'home' ? k : 'other';
}

/** Re-derive today's start/end from persisted crossings and apply it. Only fills
 *  empty values, and stamps them 'auto' so a manual edit is never overwritten. */
export async function runDayDetection(): Promise<void> {
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const day = await getOrCreateDay(todayStr);
    const crossings = await crossingsForDay(day.id, kindOf);
    const r = inferDay({
      crossings,
      now: new Date().toISOString(),
      startedAtSet: !!day.started_at,
      endedAtSet: !!day.ended_at,
    });
    if (r.startedAt && !day.started_at) {
      await updateDay(day.id, {started_at: r.startedAt, started_at_source: 'auto'});
    }
    if (r.endedAt && !day.ended_at) {
      await updateDay(day.id, {ended_at: r.endedAt, ended_at_source: 'auto'});
      if (r.confirmEnd) {
        try {
          const id = await createDayEndConfirmation(day.id, r.endedAt);
          await displayDayEndConfirmation(day.id, r.endedAt, id);
        } catch {
          // confirmation is best-effort
        }
      }
    }
  } catch {
    // never crash tracking over detection
  }
}

/** Persist an incoming crossing, then re-run inference. */
export async function recordAndInfer(e: CrossingEvent): Promise<void> {
  try {
    if (e.locationId < 0) return;
    const dayStr = format(new Date(e.timestamp), 'yyyy-MM-dd');
    const day = await getOrCreateDay(dayStr);
    await recordCrossing({
      locationId: e.locationId,
      dayId: day.id,
      type: e.type,
      latitude: e.latitude,
      longitude: e.longitude,
      time: new Date(e.timestamp).toISOString(),
    });
    await runDayDetection();
  } catch {
    // best-effort
  }
}

function monitoredPlacesFromLocations() {
  return _locations
    .filter(l => l.kind === 'work' || l.kind === 'home')
    .map(l => ({
      id: l.id,
      latitude: l.latitude,
      longitude: l.longitude,
      radius: l.radius_m,
      kind: l.kind,
    }));
}

/** Register monitored places and subscribe to crossings. Call on tracking-start. */
export async function startDayDetection(): Promise<void> {
  await loadLocations();
  monitorPlaces(monitoredPlacesFromLocations());
  _sub?.remove();
  _sub = subscribeGeofenceCrossing(recordAndInfer);
}

export function stopDayDetection(): void {
  _sub?.remove();
  _sub = null;
}

/** Reload the saved-locations cache and, if detection is active, re-register
 *  the monitored OS geofences. Call after any saved-location create/edit/delete
 *  so a mid-session change is picked up without a tracking restart. */
export async function refreshMonitoredPlaces(): Promise<void> {
  await loadLocations();
  if (_sub !== null) {
    monitorPlaces(monitoredPlacesFromLocations());
  }
}
