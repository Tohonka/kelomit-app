import {APP_VERSION} from '../version';
import type {ProductFields} from '../db/food';

// Open Food Facts requires an identifying User-Agent; generic ones get blocked.
// Only the barcode leaves the phone (master plan decision #15).
const BASE = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS =
  'code,product_name,product_name_fi,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url';
const USER_AGENT = `Kelomit/${APP_VERSION} (tommi@pico.fi)`;
const TIMEOUT_MS = 8000;

type Json = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** "10 g" / "2.5 dl" → leading number, else null. */
function leadingNumber(s: string | null): number | null {
  if (!s) { return null; }
  const m = /^\s*([\d.,]+)/.exec(s);
  if (!m) { return null; }
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Pure mapper over the v2 product JSON. Null = not found / unusable. */
export function offToProduct(json: unknown, barcode: string): ProductFields | null {
  const root = json as Json | null;
  if (!root || root.status !== 1) { return null; }
  const p = root.product as Json | undefined;
  if (!p) { return null; }
  const name = str(p.product_name_fi) ?? str(p.product_name);
  if (!name) { return null; }
  const n = (p.nutriments as Json | undefined) ?? {};
  const kj = num(n['energy-kj_100g']);
  const kcal100 = num(n['energy-kcal_100g']) ?? (kj != null ? Math.round((kj / 4.184) * 10) / 10 : null);
  const servingLabel = str(p.serving_size);
  return {
    barcode,
    name,
    brand: str(p.brands),
    kcal_per_100: kcal100,
    kcal_per_serving: num(n['energy-kcal_serving']),
    protein_per_100: num(n.proteins_100g),
    carbs_per_100: num(n.carbohydrates_100g),
    fat_per_100: num(n.fat_100g),
    serving_g: num(p.serving_quantity) ?? leadingNumber(servingLabel),
    serving_label: servingLabel,
    source: 'off',
    source_ref: str(p.code) ?? barcode,
    image_url: str(p.image_front_small_url),
  };
}

/** Online lookup. Null = OFF doesn't know the code. Throws on network / HTTP errors
 *  so the caller can tell "unknown product" from "offline". */
export async function lookupBarcode(barcode: string): Promise<ProductFields | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
      signal: controller.signal,
    });
    // OFF answers 404 for unknown codes with a JSON body (status 0).
    if (!res.ok && res.status !== 404) {
      throw new Error(`Open Food Facts HTTP ${res.status}`);
    }
    return offToProduct(await res.json(), barcode);
  } finally {
    clearTimeout(timer);
  }
}
