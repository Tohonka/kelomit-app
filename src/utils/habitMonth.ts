// Pure month/grid math for the habit dot matrix. Month keys are 'yyyy-MM',
// dates 'yyyy-MM-dd' (local), weeks Monday-first (Finnish convention).

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1 + delta, 1));
}

export function monthDate(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

/** First and last date of the month. */
export function monthRange(month: string): {from: string; to: string} {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`};
}

/** Mon-first 7-column grid: leading nulls pad the first week, trailing nulls
 *  fill the last row so length is always a multiple of 7. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) { cells.push(null); }
  return cells;
}
