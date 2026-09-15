import type {FoodEntry} from '../types';

/** A one-tap re-log template: what to copy from a past entry onto "now". */
export type RecentFood = Pick<FoodEntry, 'name' | 'kcal' | 'product_id' | 'quantity' | 'unit'>;

const NEAR_MIN = 90;

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function isNear(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff) <= NEAR_MIN;
}

/** Recents strip: things eaten around this time of day first, then overall
 *  frequency, then recency. One template per product / name. */
export function rankRecents(entries: FoodEntry[], nowMinutesOfDay: number, limit = 6): RecentFood[] {
  const groups = new Map<string, {near: number; total: number; latest: FoodEntry}>();
  for (const e of entries) {
    const key = e.product_id != null ? `p:${e.product_id}` : `n:${e.name.trim().toLowerCase()}`;
    const g = groups.get(key) ?? {near: 0, total: 0, latest: e};
    g.total += 1;
    if (isNear(minutesOfDay(e.eaten_at), nowMinutesOfDay)) { g.near += 1; }
    if (e.eaten_at > g.latest.eaten_at) { g.latest = e; }
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.near - a.near || b.total - a.total || b.latest.eaten_at.localeCompare(a.latest.eaten_at))
    .slice(0, limit)
    .map(({latest}) => ({
      name: latest.name, kcal: latest.kcal, product_id: latest.product_id,
      quantity: latest.quantity, unit: latest.unit,
    }));
}

export function scaleKcal(kcal: number | null, factor: number): number | null {
  return kcal == null ? null : Math.round(kcal * factor);
}
