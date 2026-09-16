import type {FineliFood, FineliUnit, FoodEntry, FoodProduct, FoodUnit} from '../types';
import type {ProductFields} from '../db/food';

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

type PortionSource = Pick<FoodProduct, 'kcal_per_100' | 'kcal_per_serving' | 'serving_g'>;

/** kcal for `quantity` of a product in `unit`; null when the product can't say. */
export function kcalFor(p: PortionSource, quantity: number, unit: FoodUnit): number | null {
  if (unit === 'g' || unit === 'ml') {
    return p.kcal_per_100 != null ? Math.round((p.kcal_per_100 * quantity) / 100) : null;
  }
  if (p.kcal_per_serving != null) { return Math.round(p.kcal_per_serving * quantity); }
  if (p.kcal_per_100 != null && p.serving_g != null) {
    return Math.round(((p.kcal_per_100 * p.serving_g) / 100) * quantity);
  }
  return null;
}

/** One serving when the product knows one, else 100 g. */
export function defaultPortion(p: PortionSource): {quantity: number; unit: FoodUnit} {
  return p.kcal_per_serving != null || p.serving_g != null
    ? {quantity: 1, unit: 'serving'}
    : {quantity: 100, unit: 'g'};
}

/** Make a reusable product out of a Fineli food; its first household unit
 *  (most useful first — see scripts/build-fineli.js UNIT_ORDER) becomes the serving. */
export function fineliToProduct(
  food: FineliFood,
  units: FineliUnit[],
  unitLabels: Record<string, [string, string]>,
  lang: 'fi' | 'en',
): ProductFields {
  const first = units[0];
  const label = first ? unitLabels[first.code]?.[lang === 'fi' ? 0 : 1] ?? first.code : null;
  return {
    barcode: null,
    name: lang === 'fi' ? food.name_fi : food.name_en ?? food.name_fi,
    brand: null,
    kcal_per_100: food.kcal_per_100,
    kcal_per_serving: first ? Math.round((food.kcal_per_100 * first.grams) / 100) : null,
    protein_per_100: food.protein_per_100,
    carbs_per_100: food.carbs_per_100,
    fat_per_100: food.fat_per_100,
    serving_g: first?.grams ?? null,
    serving_label: label,
    source: 'fineli',
    source_ref: String(food.id),
    image_url: null,
  };
}
