import type Database from 'better-sqlite3';
import {getDaysInRange, getEntriesInRange, getSetting, hasTable} from '../../../server/src/queries.ts';
import {calcDayWorkSecs} from '../../../src/utils/hoursUtils.ts';
import {emptyMovement, summarizeSegments} from '../../../src/utils/movementSummary.ts';
import type {MovementSummary} from '../../../src/utils/movementSummary.ts';
import {movementKcal} from '../../../src/utils/energy.ts';
import {bmrMifflin, energyDay, missingProfileFields} from '../../../src/utils/energyDay.ts';
import type {ProfileField, WorkActivity} from '../../../src/utils/energyDay.ts';
import {findPatterns, usableDays} from '../../../src/utils/patterns.ts';
import type {DayPoint, Pattern} from '../../../src/utils/patterns.ts';
import {habitDone, habitStates, localToday, shiftDate} from './life.ts';
import type {DayRouteSegment, Entry, HealthDaily, Sex} from '../../../src/types/index.ts';

/**
 * The phone's Insights ("Balance") screen as one synchronous read: work
 * breakdowns, movement, habits, food, energy, health and patterns for a
 * period. Same SQL and the same pure utils as the phone; the renderer only
 * formats. It shows, it never grades — no scores, no targets beyond the
 * weekly hours one the phone already has.
 */
export type Period = 'week' | 'month' | 'last30';
export type Scope = 'all' | 'work' | 'personal';

export interface Slice {
  key: string;
  /** Project / tag name; for activities the key (the renderer labels those). */
  label: string;
  seconds: number;
}

export interface FoodDay {
  kcal: number;
  entries: number;
  noKcal: number;
}

export interface Insights {
  period: Period;
  scope: Scope;
  start: string;
  end: string;
  today: string;
  weeklyTargetHours: number;
  work: {
    totalSeconds: number;
    byActivity: Slice[];
    byProject: Slice[];
    byTag: Slice[];
    /** Counted work seconds per day (the hours model), all scopes. */
    byDay: Record<string, number>;
  };
  movement: MovementSummary & {kcal: number | null; footSecByDay: Record<string, number>};
  habits: {id: number; title: string; done: number}[];
  food: {kcal: number; entries: number; noKcal: number; days: number; byDay: Record<string, FoodDay>};
  health: {
    steps: number | null;
    sleep: number | null;
    hr: number | null;
    weightFrom: number | null;
    weightTo: number | null;
    stepsByDay: Record<string, number>;
  };
  energy: {
    bmr: number | null;
    missing: ProfileField[];
    /** Finished days only. */
    used: number;
    usedAvg: number;
    eaten: number;
    eatenAvg: number;
    eatenDays: number;
    days: number;
    usedByDay: Record<string, number>;
  };
  patterns: {days: number; list: Pattern[]};
}

const PATTERN_DAYS = 90;

// The phone's ENTRY_SECS_SQL (src/db/entries.ts), copied: that module opens
// op-sqlite and can't be imported here.
const ENTRY_SECS_SQL = `CASE
    WHEN e.duration_sec IS NOT NULL THEN e.duration_sec
    WHEN e.time_from IS NOT NULL AND e.time_to IS NOT NULL
      THEN MAX(0, CAST(strftime('%s', e.time_to) AS INTEGER) - CAST(strftime('%s', e.time_from) AS INTEGER))
    ELSE 0
  END`;
const SCOPE_FILTER: Record<Scope, string> = {
  all: '',
  work: "AND e.activity_type = 'work'",
  personal: "AND e.activity_type IN ('personal', 'personal_work')",
};

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return shiftDate(date, -((d.getDay() + 6) % 7));
}

export function rangeFor(period: Period, today = localToday()): {start: string; end: string} {
  if (period === 'week') return {start: mondayOf(today), end: today};
  if (period === 'month') return {start: `${today.slice(0, 7)}-01`, end: today};
  return {start: shiftDate(today, -29), end: today};
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) out.push(d);
  return out;
}

function slices(
  rows: {k: unknown; name?: string | null; s: number | null}[],
  label: (r: {k: unknown; name?: string | null}) => string
): Slice[] {
  return rows
    .map(r => ({key: String(r.k), label: label(r), seconds: r.s ?? 0}))
    .filter(s => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

function breakdown(db: Database.Database, start: string, end: string, scope: Scope): Omit<Insights['work'], 'byDay'> {
  const where = `WHERE d.date >= ? AND d.date <= ? AND (e.is_todo = 0 OR e.completed_at IS NOT NULL) ${SCOPE_FILTER[scope]}`;
  type R = {k: unknown; name?: string | null; s: number | null};
  const byActivity = slices(
    db
      .prepare(
        `SELECT e.activity_type AS k, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s FROM entries e JOIN days d ON d.id = e.day_id ${where} GROUP BY e.activity_type`
      )
      .all(start, end) as R[],
    r => String(r.k)
  );
  const byProject = slices(
    db
      .prepare(
        `SELECT e.project_id AS k, p.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
           FROM entries e JOIN days d ON d.id = e.day_id LEFT JOIN projects p ON p.id = e.project_id ${where} GROUP BY e.project_id`
      )
      .all(start, end) as R[],
    r => r.name ?? 'No project'
  );
  const byTag = slices(
    db
      .prepare(
        `SELECT t.id AS k, t.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
           FROM entries e JOIN days d ON d.id = e.day_id JOIN entry_tags et ON et.entry_id = e.id JOIN tags t ON t.id = et.tag_id ${where} GROUP BY t.id`
      )
      .all(start, end) as R[],
    r => r.name ?? '—'
  );
  return {totalSeconds: byActivity.reduce((s, x) => s + x.seconds, 0), byActivity, byProject, byTag};
}

/** getWorkSecondsByDay: days + entries folded through the hours model. */
function workSecondsByDay(db: Database.Database, start: string, end: string): Record<string, number> {
  const days = getDaysInRange(db, start, end);
  const byDayId = new Map<number, Entry[]>();
  for (const e of getEntriesInRange(db, start, end)) byDayId.set(e.day_id, [...(byDayId.get(e.day_id) ?? []), e]);
  const out: Record<string, number> = {};
  for (const day of days) {
    const secs = calcDayWorkSecs(day, byDayId.get(day.id) ?? []);
    if (secs > 0) out[day.date] = secs;
  }
  return out;
}

function parse<T>(json: unknown, fallback: T): T {
  if (typeof json !== 'string' || !json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Only the fields `summarizeSegments` reads. */
function segmentsByDay(db: Database.Database, start: string, end: string): Map<string, DayRouteSegment[]> {
  const out = new Map<string, DayRouteSegment[]>();
  if (!hasTable(db, 'day_route_segments')) return out;
  const rows = db
    .prepare(
      `SELECT d.date AS date, s.coordinates_json, s.mode_spans_json, s.still_seconds
         FROM day_route_segments s JOIN days d ON d.id = s.day_id
        WHERE d.date >= ? AND d.date <= ? ORDER BY d.date, s.sequence`
    )
    .all(start, end) as {date: string; coordinates_json: string; mode_spans_json: string | null; still_seconds: number | null}[];
  for (const r of rows) {
    const seg = {
      coordinates: parse(r.coordinates_json, []),
      mode_spans: parse(r.mode_spans_json, null),
      still_seconds: r.still_seconds,
    } as unknown as DayRouteSegment;
    out.set(r.date, [...(out.get(r.date) ?? []), seg]);
  }
  return out;
}

function foodByDay(db: Database.Database, start: string, end: string): Record<string, FoodDay> {
  const out: Record<string, FoodDay> = {};
  if (!hasTable(db, 'food_entries')) return out;
  for (const r of db
    .prepare(
      `SELECT d.date AS date, COALESCE(SUM(f.kcal), 0) AS kcal, COUNT(*) AS entries, SUM(CASE WHEN f.kcal IS NULL THEN 1 ELSE 0 END) AS no_kcal
         FROM food_entries f JOIN days d ON d.id = f.day_id WHERE d.date >= ? AND d.date <= ? GROUP BY d.date`
    )
    .all(start, end) as {date: string; kcal: number; entries: number; no_kcal: number}[]) {
    out[r.date] = {kcal: Number(r.kcal), entries: Number(r.entries), noKcal: Number(r.no_kcal)};
  }
  return out;
}

function healthRange(db: Database.Database, start: string, end: string): HealthDaily[] {
  if (!hasTable(db, 'health_daily')) return [];
  return (
    db.prepare('SELECT * FROM health_daily WHERE date >= ? AND date <= ? ORDER BY date').all(start, end) as Record<string, unknown>[]
  ).map(r => ({...(r as unknown as HealthDaily), exercise: parse(r.exercise, null)}));
}

const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
const num = (v: string | null) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function insights(db: Database.Database, period: Period, scope: Scope): Insights {
  const today = localToday();
  const {start, end} = rangeFor(period, today);
  const dates = datesBetween(start, end);
  const now = new Date();

  const work = {...breakdown(db, start, end, scope), byDay: workSecondsByDay(db, start, end)};

  // ── Movement ──
  const segs = segmentsByDay(db, start, end);
  const movement = summarizeSegments([...segs.values()].flat());
  const footSecByDay: Record<string, number> = {};
  for (const [date, list] of segs) footSecByDay[date] = summarizeSegments(list).footSec;

  // ── Habits: days in the period where any habit of the category was done ──
  const hs = habitStates(db, start, end);
  const habits = hs.categories
    .map(cat => {
      const ids = hs.habits.filter(h => h.category_id === cat.id).map(h => h.id);
      if (ids.length === 0) return null;
      return {id: cat.id, title: cat.title, done: dates.filter(d => ids.some(id => habitDone(hs, id, d))).length};
    })
    .filter((r): r is {id: number; title: string; done: number} => r != null);

  // ── Food / health ──
  const fbd = foodByDay(db, start, end);
  const fdays = Object.values(fbd);
  const food = {
    kcal: fdays.reduce((s, d) => s + d.kcal, 0),
    entries: fdays.reduce((s, d) => s + d.entries, 0),
    noKcal: fdays.reduce((s, d) => s + d.noKcal, 0),
    days: fdays.length,
    byDay: fbd,
  };
  const hc = healthRange(db, start, end);
  const weights = hc.map(h => h.weight_kg).filter((v): v is number => v != null);
  const steps = avg(hc.map(h => h.steps).filter((v): v is number => v != null));
  const sleep = avg(hc.map(h => h.sleep_minutes).filter((v): v is number => v != null));
  const hr = avg(hc.map(h => h.resting_hr).filter((v): v is number => v != null));
  const health = {
    steps: steps != null ? Math.round(steps) : null,
    sleep: sleep != null ? Math.round(sleep) : null,
    hr: hr != null ? Math.round(hr) : null,
    weightFrom: weights[0] ?? null,
    weightTo: weights[weights.length - 1] ?? null,
    stepsByDay: Object.fromEntries(hc.filter(h => h.steps != null).map(h => [h.date, h.steps as number])),
  };

  // ── Energy (services/energy.ts loadEnergyRange) ──
  const settingsWeight = num(getSetting(db, 'body_weight_kg'));
  const profile = {
    weightKg: [...hc].reverse().find(h => h.weight_kg != null)?.weight_kg ?? settingsWeight,
    heightCm: num(getSetting(db, 'body_height_cm')),
    birthYear: num(getSetting(db, 'birth_year')),
    sex: (getSetting(db, 'sex') as Sex | null) || null,
  };
  const wa = getSetting(db, 'work_activity');
  const workActivity: WorkActivity = wa === 'mixed' || wa === 'physical' ? wa : 'desk';
  const bmr = bmrMifflin(profile, now.getFullYear());
  const hcByDate = new Map(hc.map(h => [h.date, h]));
  const usedByDay: Record<string, number> = {};
  let used = 0;
  let eaten = 0;
  let eatenDays = 0;
  let finished = 0;
  if (bmr != null) {
    for (const date of dates) {
      const h = hcByDate.get(date);
      const list = segs.get(date);
      const e = energyDay({
        bmr,
        minutesInDay: date === today ? now.getHours() * 60 + now.getMinutes() : 1440,
        sleepMinutes: h?.sleep_minutes ?? null,
        exercise: h?.exercise ?? [],
        movement: list ? summarizeSegments(list) : emptyMovement(),
        steps: h?.steps ?? null,
        workMinutes: Math.round((work.byDay[date] ?? 0) / 60),
        workActivity,
      });
      usedByDay[date] = e.totalKcal;
      if (date < today) {
        // finished days only, so today's partial figure doesn't drag the average
        finished++;
        used += e.totalKcal;
        const f = fbd[date];
        if (f && f.entries > f.noKcal) {
          eaten += f.kcal;
          eatenDays++;
        }
      }
    }
  }
  const energy = {
    bmr,
    missing: missingProfileFields(profile),
    used,
    usedAvg: finished > 0 ? Math.round(used / finished / 10) * 10 : 0,
    eaten,
    eatenAvg: eatenDays > 0 ? Math.round(eaten / eatenDays / 10) * 10 : 0,
    eatenDays,
    days: finished,
    usedByDay,
  };

  // ── Patterns: the last 90 finished days whatever the period ──
  const pEnd = shiftDate(today, -1);
  const pStart = shiftDate(pEnd, -(PATTERN_DAYS - 1));
  const pHealth = new Map(healthRange(db, pStart, pEnd).map(h => [h.date, h]));
  const pFood = foodByDay(db, pStart, pEnd);
  const pWork = workSecondsByDay(db, pStart, pEnd);
  const phs = habitStates(db, pStart, pEnd);
  const habitIds = phs.habits.filter(h => !h.archived).map(h => h.id);
  const points: DayPoint[] = datesBetween(pStart, pEnd).map(date => {
    const h = pHealth.get(date);
    const f = pFood[date];
    return {
      date,
      sleep: h?.sleep_minutes ?? null,
      steps: h?.steps ?? null,
      exercise: h?.exercise ? h.exercise.reduce((s, b) => s + b.minutes, 0) : null,
      // a day with any kcal-less entry would read as a light day — skip it
      kcal: f && f.noKcal === 0 ? f.kcal : null,
      work: pWork[date] ? pWork[date] / 3600 : null,
      ...(habitIds.length > 0 ? {habits: (habitIds.filter(id => habitDone(phs, id, date)).length / habitIds.length) * 100} : {}),
    };
  });

  return {
    period,
    scope,
    start,
    end,
    today,
    weeklyTargetHours: num(getSetting(db, 'weekly_target_hours')) ?? 40,
    work,
    movement: {
      ...movement,
      kcal: profile.weightKg != null && (movement.footSec > 0 || movement.cycleSec > 0) ? movementKcal(movement, profile.weightKg) : null,
      footSecByDay,
    },
    habits,
    food,
    health,
    energy,
    patterns: {days: usableDays(points), list: findPatterns(points)},
  };
}
