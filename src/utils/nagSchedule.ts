import type {Nag, NagPlan, NagSchedule} from '../types';

const H = 3600_000;
const D = 24 * H;
/** Hard cap so a "6/hour for 12 hours" plan can't flood the alarm table. */
export const MAX_FIRES_PER_OCCURRENCE = 40;

function localAt(dateMs: number, hhmm: string): number {
  const d = new Date(dateMs);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime();
}

/** ISO weekday 1 = Mon … 7 = Sun. */
function isoWeekday(ms: number): number {
  const d = new Date(ms).getDay();
  return d === 0 ? 7 : d;
}

/**
 * Due instants (ISO) of a schedule between `now − lookbackDays` and
 * `now + horizonDays`. The lookback keeps a just-missed occurrence visible
 * so it can still be marked done (and keeps nagging after the due time).
 */
export function occurrences(
  schedule: NagSchedule,
  nowMs: number,
  horizonDays = 14,
  lookbackDays = 1,
): string[] {
  const lo = nowMs - lookbackDays * D;
  const hi = nowMs + horizonDays * D;
  if (schedule.kind === 'once') {
    const t = Date.parse(schedule.at);
    return t >= lo && t <= hi ? [schedule.at] : [];
  }
  if (schedule.kind === 'dates') {
    return [...schedule.at]
      .filter(a => { const t = Date.parse(a); return t >= lo && t <= hi; })
      .sort((a, b) => Date.parse(a) - Date.parse(b));
  }
  const out: string[] = [];
  if (schedule.weekdays.length === 0) { return out; }
  for (let day = lo; day <= hi + D; day += D) {
    if (!schedule.weekdays.includes(isoWeekday(day))) { continue; }
    const t = localAt(day, schedule.time);
    if (t >= lo && t <= hi) { out.push(new Date(t).toISOString()); }
  }
  return [...new Set(out)].sort();
}

/** Deterministic 0…1 from a string (FNV-1a), so random slots survive re-syncs. */
/* eslint-disable no-bitwise */
export function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0) / 0x100000000;
}
/* eslint-enable no-bitwise */

/**
 * Instants (ms) at which one occurrence should nag, all after `nowMs`,
 * sorted, deduplicated, capped. Pure: same inputs → same output.
 */
export function fireTimes(nag: Pick<Nag, 'id' | 'plan'>, dueAt: string, nowMs: number): number[] {
  const due = Date.parse(dueAt);
  const plan: NagPlan = nag.plan;
  const out = new Set<number>();
  if (plan.dayBefore) { out.add(localAt(due - D, plan.dayBefore)); }
  if (plan.onDay) { out.add(localAt(due, plan.onDay)); }
  if (plan.hoursBefore != null && plan.hoursBefore > 0) { out.add(due - plan.hoursBefore * H); }
  const r = plan.repeat;
  if (r && r.perHour > 0) {
    const slot = H / r.perHour;
    const start = due - Math.max(0, r.fromHoursBefore) * H;
    const end = due + Math.max(0, r.untilHoursAfter) * H;
    for (let i = 0, t = start; t < end; i++, t += slot) {
      const jitter = r.random ? seededUnit(`${nag.id}|${dueAt}|${i}`) * slot : 0;
      out.add(Math.round(t + jitter));
    }
  }
  return [...out]
    .filter(t => t > nowMs)
    .sort((a, b) => a - b)
    .slice(0, MAX_FIRES_PER_OCCURRENCE);
}

/** Next undone due instant of a nag (ISO) or null. */
export function nextOccurrence(
  nag: Nag,
  doneMap: Map<string, string>,
  nowMs: number,
): string | null {
  for (const due of occurrences(nag.schedule, nowMs)) {
    if (!doneMap.has(`${nag.id}|${due}`)) { return due; }
  }
  return null;
}
