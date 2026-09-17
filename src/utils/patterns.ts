/*
 * B2 "Patterns": plain comparisons, not statistics. For a pair (x → y) the
 * days are split at the median of x and the mean of y is compared between the
 * halves. A pattern is only reported when both halves have MIN_DAYS days and
 * the means differ by MIN_DIFF — otherwise it says nothing. No p-values, no
 * scores: "on days when X was low, Y averaged …".
 */

export type SeriesKey = 'sleep' | 'steps' | 'exercise' | 'kcal' | 'work' | 'habits';

/** One day's values; null/undefined = no data that day (never treated as 0). */
export type DayPoint = {date: string} & Partial<Record<SeriesKey, number | null>>;

export interface PatternPair {
  x: SeriesKey;
  y: SeriesKey;
  /** 1 = compare x with the *next* day's y (steps today → sleep tonight,
   *  because sleep is filed under its wake-up date). */
  lag: 0 | 1;
}

export const PATTERN_PAIRS: PatternPair[] = [
  {x: 'sleep', y: 'kcal', lag: 0},
  {x: 'sleep', y: 'work', lag: 0},
  {x: 'sleep', y: 'habits', lag: 0},
  {x: 'steps', y: 'sleep', lag: 1},
  {x: 'exercise', y: 'sleep', lag: 1},
  {x: 'work', y: 'kcal', lag: 0},
  {x: 'work', y: 'habits', lag: 0},
  {x: 'work', y: 'steps', lag: 0},
];

export const MIN_DAYS = 7;
const MIN_DIFF = 0.1;

export interface Pattern extends PatternPair {
  /** Median of x: the "low" half is x < threshold. */
  threshold: number;
  lowMean: number;
  highMean: number;
  lowDays: number;
  highDays: number;
  /** |high − low| / max — what the list is ranked by. */
  strength: number;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function comparePair(points: DayPoint[], pair: PatternPair): Pattern | null {
  const byDate = new Map(points.map(p => [p.date, p]));
  const rows: {x: number; y: number}[] = [];
  for (const p of points) {
    const x = p[pair.x];
    const y = (pair.lag === 0 ? p : byDate.get(nextDate(p.date)))?.[pair.y];
    if (x != null && y != null) { rows.push({x, y}); }
  }
  if (rows.length < MIN_DAYS * 2) { return null; }
  const xs = rows.map(r => r.x).sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  const threshold = xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  const low = rows.filter(r => r.x < threshold).map(r => r.y);
  const high = rows.filter(r => r.x >= threshold).map(r => r.y);
  if (low.length < MIN_DAYS || high.length < MIN_DAYS) { return null; }
  const lowMean = mean(low);
  const highMean = mean(high);
  const top = Math.max(Math.abs(lowMean), Math.abs(highMean));
  const strength = top > 0 ? Math.abs(highMean - lowMean) / top : 0;
  if (strength < MIN_DIFF) { return null; }
  return {...pair, threshold, lowMean, highMean, lowDays: low.length, highDays: high.length, strength};
}

/** The strongest few patterns in `points`, strongest first. */
export function findPatterns(points: DayPoint[], limit = 5): Pattern[] {
  return PATTERN_PAIRS
    .map(pair => comparePair(points, pair))
    .filter((p): p is Pattern => p != null)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

/** Days that carry at least two series — the honest "how much data is there"
 *  number for the empty state. */
export function usableDays(points: DayPoint[]): number {
  const keys: SeriesKey[] = ['sleep', 'steps', 'exercise', 'kcal', 'work', 'habits'];
  return points.filter(p => keys.filter(k => p[k] != null).length >= 2).length;
}
