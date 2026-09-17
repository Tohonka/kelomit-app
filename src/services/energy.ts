import {getWorkSecondsByDay} from '../db/entries';
import {getFoodKcalByDay} from '../db/food';
import {getHealthDailyRange} from '../db/health';
import {getSegmentsInRange} from '../db/routeHistory';
import {useSettingsStore} from '../store/settingsStore';
import {datesBetween, todayDate} from '../utils/dateUtils';
import {bmrMifflin, energyDay, missingProfileFields, type EnergyDay, type ProfileField} from '../utils/energyDay';
import {emptyMovement, summarizeSegments} from '../utils/movementSummary';
import type {DayRouteSegment, HealthDaily} from '../types';

export interface EnergyDayRow extends EnergyDay {
  date: string;
  eatenKcal: number | null;
  /** Health Connect's own figure for the day — a second opinion, never mixed in. */
  hcTotalKcal: number | null;
}

export interface EnergyRange {
  /** Null while the body profile is incomplete; `missing` says what to fill in. */
  bmr: number | null;
  missing: ProfileField[];
  days: EnergyDayRow[];
}

/** Energy estimate for every date in [start, end] up to today. Weight is the
 *  latest Health Connect reading in the range, else the body profile. */
export async function loadEnergyRange(start: string, end: string): Promise<EnergyRange> {
  const s = useSettingsStore.getState();
  const today = todayDate();
  const [health, segments, workSecs, food] = await Promise.all([
    getHealthDailyRange(start, end).catch((): HealthDaily[] => []),
    getSegmentsInRange(start, end).catch(() => []),
    getWorkSecondsByDay(start, end).catch((): Record<string, number> => ({})),
    getFoodKcalByDay(start, end).catch(() => ({})),
  ]);
  const profile = {
    weightKg: [...health].reverse().find(h => h.weight_kg != null)?.weight_kg ?? s.body_weight_kg,
    heightCm: s.body_height_cm,
    birthYear: s.birth_year,
    sex: s.sex,
  };
  const bmr = bmrMifflin(profile, new Date().getFullYear());
  const missing = missingProfileFields(profile);
  if (bmr == null) { return {bmr, missing, days: []}; }

  const healthByDate = new Map(health.map(h => [h.date, h]));
  const segsByDate = new Map<string, DayRouteSegment[]>();
  for (const {date, segment} of segments) {
    segsByDate.set(date, [...(segsByDate.get(date) ?? []), segment]);
  }
  const foodByDate = food as Record<string, {kcal: number; entries: number; noKcal: number}>;
  const now = new Date();

  const days = datesBetween(start, end)
    .filter(date => date <= today)
    .map((date): EnergyDayRow => {
      const h = healthByDate.get(date);
      const segs = segsByDate.get(date);
      const f = foodByDate[date];
      return {
        date,
        ...energyDay({
          bmr,
          minutesInDay: date === today ? now.getHours() * 60 + now.getMinutes() : 1440,
          sleepMinutes: h?.sleep_minutes ?? null,
          exercise: h?.exercise ?? [],
          movement: segs ? summarizeSegments(segs) : emptyMovement(),
          steps: h?.steps ?? null,
          workMinutes: Math.round((workSecs[date] ?? 0) / 60),
          workActivity: s.work_activity,
        }),
        eatenKcal: f && f.entries > f.noKcal ? f.kcal : null,
        hcTotalKcal: h?.total_kcal != null ? Math.round(h.total_kcal) : null,
      };
    });
  return {bmr, missing, days};
}
