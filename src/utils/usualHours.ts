// Per-weekday usual-hours overrides on top of the single default usual_start/end.
// Stored as one JSON setting (`weekday_hours`), keyed by JS getDay() (0=Sun..6=Sat).
// An absent weekday = use the default; {off:true} = day off (no usual hours);
// {start,end} = custom "HH:mm" for that weekday.

export type WeekdayOverride = {off: true} | {start: string; end: string};
export type WeekdayHours = Record<number, WeekdayOverride>;

export interface ResolvedUsual {
  start: string | null;
  end: string | null;
}

const isHHmm = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v);

/** Parse + validate the stored JSON. Anything malformed → no overrides. */
export function parseWeekdayHours(json: string | undefined | null): WeekdayHours {
  if (!json) {
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out: WeekdayHours = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const wd = Number(k);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6 || !v || typeof v !== 'object') {
      continue;
    }
    const o = v as Record<string, unknown>;
    if (o.off === true) {
      out[wd] = {off: true};
    } else if (isHHmm(o.start) && isHHmm(o.end)) {
      out[wd] = {start: o.start, end: o.end};
    }
  }
  return out;
}

/** Resolve the usual start/end for a given date, applying any weekday override.
 *  Day off → {null, null}. No override → the default. */
export function usualHoursForDate(
  dateStr: string,
  defaultStart: string | null,
  defaultEnd: string | null,
  weekdayHours: WeekdayHours,
): ResolvedUsual {
  // Noon anchor so the weekday can't slip across a DST/midnight boundary.
  const wd = new Date(`${dateStr}T12:00:00`).getDay();
  const ov = weekdayHours[wd];
  if (ov) {
    return 'off' in ov ? {start: null, end: null} : {start: ov.start, end: ov.end};
  }
  return {start: defaultStart ?? null, end: defaultEnd ?? null};
}
