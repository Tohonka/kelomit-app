import {
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  type Permission,
  type ReadHealthDataHistoryPermission,
} from 'react-native-health-connect';
import {upsertHealthDaily} from '../db/health';
import {getSetting, setSetting} from '../db/settings';
import {useSettingsStore} from '../store/settingsStore';
import {buildHealthDays, type DayValue, type Sample} from '../utils/healthAggregate';
import {localDateOf} from '../utils/timeFormat';
import {shiftDate, todayDate} from '../utils/dateUtils';

/*
 * Health Connect import (plan 2026-09-14 H1). Daily totals only — raw records
 * never touch our database. Reads happen on app foreground, throttled; the
 * history permission is requested from day one so the 30-day read window
 * survives our uninstall→reinstall sideload cycle.
 */

const RECORD_TYPES = [
  'Steps',
  'Distance',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'SleepSession',
  'Weight',
  'Height',
  'RestingHeartRate',
] as const;

export const HEALTH_PERMISSIONS: (Permission | ReadHealthDataHistoryPermission)[] = [
  ...RECORD_TYPES.map(recordType => ({accessType: 'read', recordType}) as Permission),
  {accessType: 'read', recordType: 'ReadHealthDataHistory'},
];

const LAST_IMPORT_KEY = 'health_last_import';
const IMPORT_INTERVAL_MS = 3 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 7;
const FIRST_WINDOW_DAYS = 90;

export type HealthStatus = 'available' | 'update_required' | 'unavailable';

export async function getHealthStatus(): Promise<HealthStatus> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) { return 'available'; }
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) { return 'update_required'; }
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function coversAllTypes(granted: {accessType: string; recordType: string}[]): boolean {
  const have = new Set(granted.filter(p => p.accessType === 'read').map(p => p.recordType));
  return RECORD_TYPES.every(r => have.has(r));
}

/** Ask for every read permission. True when all record types were granted
 *  (history is nice-to-have and never blocks). */
export async function connectHealth(): Promise<boolean> {
  if (!(await initialize())) { return false; }
  const granted = await requestPermission(HEALTH_PERMISSIONS);
  return coversAllTypes(granted);
}

export async function isHealthConnected(): Promise<boolean> {
  try {
    if (!(await initialize())) { return false; }
    return coversAllTypes(await getGrantedPermissions());
  } catch {
    return false;
  }
}

export function openHealthSettings(): void {
  openHealthConnectSettings();
}

export async function getLastImportAt(): Promise<string | null> {
  return getSetting(LAST_IMPORT_KEY);
}

function localStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

type TotalType = 'Steps' | 'Distance' | 'ActiveCaloriesBurned' | 'TotalCaloriesBurned';

async function dailyTotals(recordType: TotalType, startTime: string, endTime: string): Promise<DayValue[]> {
  const groups = await aggregateGroupByPeriod({
    recordType,
    timeRangeFilter: {operator: 'between', startTime, endTime},
    timeRangeSlicer: {period: 'DAYS', length: 1},
  });
  const out: DayValue[] = [];
  for (const g of groups) {
    // The library's AggregateResult<T> doesn't narrow over a union T; pick by
    // the type we asked for instead of the discriminant.
    const r = g.result as unknown as {
      COUNT_TOTAL?: number;
      DISTANCE?: {inMeters: number};
      ACTIVE_CALORIES_TOTAL?: {inKilocalories: number};
      ENERGY_TOTAL?: {inKilocalories: number};
    };
    const value =
      recordType === 'Steps' ? r.COUNT_TOTAL
      : recordType === 'Distance' ? r.DISTANCE?.inMeters
      : recordType === 'ActiveCaloriesBurned' ? r.ACTIVE_CALORIES_TOTAL?.inKilocalories
      : r.ENERGY_TOTAL?.inKilocalories;
    if (value != null && value > 0) { out.push({date: localDateOf(g.startTime), value}); }
  }
  return out;
}

async function samples(
  recordType: 'Weight' | 'Height' | 'RestingHeartRate',
  startTime: string,
  endTime: string,
): Promise<Sample[]> {
  // ponytail: one page. Weight/height/resting-HR samples over 90 days fit the
  // default page size for one person; add pageToken paging if a source floods it.
  const {records} = await readRecords(recordType, {
    timeRangeFilter: {operator: 'between', startTime, endTime},
  });
  return (records as unknown as {
    time: string;
    weight?: {inKilograms: number};
    height?: {inMeters: number};
    beatsPerMinute?: number;
  }[]).map(r => ({
    time: r.time,
    value:
      recordType === 'Weight' ? r.weight?.inKilograms ?? NaN
      : recordType === 'Height' ? (r.height?.inMeters ?? NaN) * 100
      : r.beatsPerMinute ?? NaN,
  }));
}

/** Import [fromDate, toDate] (local dates, inclusive) into health_daily.
 *  Returns the number of day rows written. Throws on Health Connect errors. */
export async function importHealthDays(fromDate: string, toDate: string): Promise<number> {
  if (!(await initialize())) { throw new Error('Health Connect unavailable'); }
  const startTime = localStart(fromDate);
  const endTime = localStart(shiftDate(toDate, 1));
  // Sleep that ends on fromDate may have started the evening before.
  const sleepStart = localStart(shiftDate(fromDate, -1));
  const [steps, distanceM, activeKcal, totalKcal, sleepRes, weightKg, heightCm, restingHr] =
    await Promise.all([
      dailyTotals('Steps', startTime, endTime),
      dailyTotals('Distance', startTime, endTime),
      dailyTotals('ActiveCaloriesBurned', startTime, endTime),
      dailyTotals('TotalCaloriesBurned', startTime, endTime),
      readRecords('SleepSession', {timeRangeFilter: {operator: 'between', startTime: sleepStart, endTime}}),
      samples('Weight', startTime, endTime),
      samples('Height', startTime, endTime),
      samples('RestingHeartRate', startTime, endTime),
    ]);
  const rows = buildHealthDays(
    {
      steps,
      distanceM,
      activeKcal,
      totalKcal,
      sleep: sleepRes.records.map(r => ({startTime: r.startTime, endTime: r.endTime})),
      weightKg,
      heightCm,
      restingHr,
    },
    new Date().toISOString(),
  ).filter(r => r.date >= fromDate && r.date <= toDate);
  for (const row of rows) {
    await upsertHealthDaily(row);
  }
  await setSetting(LAST_IMPORT_KEY, new Date().toISOString());
  return rows.length;
}

/** Foreground trigger: import at most every 3 h while enabled. The first run
 *  reaches back 90 days (the history permission makes that legal). */
export async function maybeImportHealth(force = false): Promise<number> {
  if (!useSettingsStore.getState().health_enabled) { return 0; }
  const last = await getLastImportAt();
  if (!force && last) {
    const age = Date.now() - new Date(last).getTime();
    if (Number.isFinite(age) && age < IMPORT_INTERVAL_MS) { return 0; }
  }
  const today = todayDate();
  const from = shiftDate(today, -(last ? RECENT_WINDOW_DAYS : FIRST_WINDOW_DAYS));
  return importHealthDays(from, today);
}
