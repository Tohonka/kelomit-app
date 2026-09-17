import {getOrCreateDay} from '../db/days';
import {
  createFoodEntry,
  getBarcodeProducts,
  getProduct,
  getProductByBarcode,
  getRecentFoodEntries,
  onFoodChange,
  upsertProduct,
} from '../db/food';
import {
  isWidgetBridgeAvailable,
  nativeClearPendingFoodAdds,
  nativeGetPendingFoodAdds,
  nativeSetFoodWidgetState,
} from '../native/widgetSession';
import {defaultPortion, kcalFor, rankRecents, type RecentFood} from '../utils/foodMath';
import {localDateOf} from '../utils/timeFormat';
import {lookupBarcode} from './openFoodFacts';
import {diag} from './diag';
import type {FoodProduct, FoodUnit} from '../types';

/*
 * Food widget (plan 2026-09-17 T7), JS half. Same contract as the habit
 * widget: the widget never touches SQLite — it shows the list we push and
 * queues what was tapped; we fold the queue into food_entries when we run.
 */

const LIST_SIZE = 50;
const MY_FOODS_DAYS = 365;
const UNITS: FoodUnit[] = ['g', 'ml', 'serving', 'piece'];

export interface PendingFoodAdd extends RecentFood {
  eaten_at: string;
  /** Set for a scan the widget couldn't match: resolve it, remember it. */
  barcode?: string;
}

/** One serving (or 100 g) of a product as a one-tap template. */
function productTemplate(p: FoodProduct): RecentFood {
  const portion = defaultPortion(p);
  return {
    name: p.brand ? `${p.brand} ${p.name}` : p.name,
    kcal: kcalFor(p, portion.quantity, portion.unit),
    product_id: p.id,
    quantity: portion.quantity,
    unit: portion.unit,
  };
}

/** The blob the widget reads. A barcode maps to the way that product was last
 *  eaten when it is in the list, else to one default portion. */
export function buildFoodWidgetState(foods: RecentFood[], products: FoodProduct[]) {
  const byProduct = new Map(foods.filter(f => f.product_id != null).map(f => [f.product_id, f]));
  const barcodes: Record<string, RecentFood> = {};
  for (const p of products) {
    if (p.barcode) { barcodes[p.barcode] = byProduct.get(p.id) ?? productTemplate(p); }
  }
  return {foods: foods.slice(0, LIST_SIZE), barcodes};
}

/** Queue rows are data from outside the JS world: keep only what is well-formed. */
export function parsePendingAdds(raw: unknown[]): PendingFoodAdd[] {
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const out: PendingFoodAdd[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r == null) { continue; }
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim()) { continue; }
    if (typeof o.eaten_at !== 'string' || Number.isNaN(new Date(o.eaten_at).getTime())) { continue; }
    out.push({
      name: o.name,
      kcal: num(o.kcal),
      product_id: num(o.product_id),
      quantity: num(o.quantity),
      unit: UNITS.includes(o.unit as FoodUnit) ? (o.unit as FoodUnit) : null,
      // Java's Instant.toString() varies in precision; our sorts compare strings.
      eaten_at: new Date(o.eaten_at).toISOString(),
      ...(typeof o.barcode === 'string' && o.barcode ? {barcode: o.barcode} : {}),
    });
  }
  return out;
}

/** "Add anyway" on an unknown barcode: by now it may be known (scanned in the
 *  app since), Open Food Facts may know it, or it becomes a placeholder product
 *  so the next scan of the same code is a one-tap add. */
async function resolveScan(p: PendingFoodAdd, barcode: string): Promise<RecentFood> {
  let product = await getProductByBarcode(barcode);
  if (!product) {
    let off: Awaited<ReturnType<typeof lookupBarcode>>;
    try {
      off = await lookupBarcode(barcode);
    } catch {
      // Offline is not "unknown": log the bare entry and leave the barcode
      // unclaimed, so the next scan of it still gets a real lookup.
      return p;
    }
    product = await upsertProduct(off ?? {
      barcode, name: p.name, brand: null, kcal_per_100: null, kcal_per_serving: null,
      protein_per_100: null, carbs_per_100: null, fat_per_100: null, serving_g: null,
      serving_label: null, source: 'user', source_ref: null, image_url: null,
    });
  }
  return productTemplate(product);
}

let draining = false;

/**
 * Drain widget adds into food_entries, then push the fresh list. Returns true
 * when entries were added. No-op without the native bridge.
 */
export async function syncFoodWidget(): Promise<boolean> {
  if (!isWidgetBridgeAvailable() || draining) { return false; }
  draining = true;
  try {
    const pending = parsePendingAdds(await nativeGetPendingFoodAdds());
    // Clear first: a crash mid-drain loses a tap, which beats logging it twice.
    if (pending.length) { await nativeClearPendingFoodAdds(); }
    for (const p of pending) {
      // One bad row (e.g. a product deleted since the list was pushed) must
      // not take the rest of the queue with it.
      try {
        const tpl: RecentFood = p.barcode ? await resolveScan(p, p.barcode) : p;
        const day = await getOrCreateDay(localDateOf(p.eaten_at));
        const known = tpl.product_id != null && (await getProduct(tpl.product_id)) != null;
        await createFoodEntry({
          day_id: day.id, eaten_at: p.eaten_at, name: tpl.name, kcal: tpl.kcal,
          product_id: known ? tpl.product_id : null, quantity: tpl.quantity, unit: tpl.unit,
        });
      } catch (e) {
        diag('widget.food.add.fail', String(e));
      }
    }
    await pushFoodWidgetState();
    return pending.length > 0;
  } finally {
    draining = false;
  }
}

// ponytail: the list is ranked for the time of day it was pushed at (app start,
// foreground, background, every food write) — not re-ranked while the app is
// dead. Native re-ranking if the morning list at dinner time ever annoys.
async function pushFoodWidgetState(): Promise<void> {
  const since = new Date(Date.now() - MY_FOODS_DAYS * 86400000).toISOString();
  const now = new Date();
  const [entries, products] = await Promise.all([getRecentFoodEntries(since), getBarcodeProducts()]);
  const foods = rankRecents(entries, now.getHours() * 60 + now.getMinutes(), LIST_SIZE);
  await nativeSetFoodWidgetState(JSON.stringify(buildFoodWidgetState(foods, products)));
}

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Called once at app start: keep the widget's list in step with the log. */
export function startFoodWidgetSync(): void {
  if (started || !isWidgetBridgeAvailable()) { return; }
  started = true;
  onFoodChange(() => {
    // Coalesce bursts (a drain writes several rows).
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(() => {
      timer = null;
      if (!draining) { pushFoodWidgetState().catch(() => {}); }
    }, 1500);
  });
}
