import {app, ipcMain} from 'electron';
import {offToProduct} from '../../../src/services/openFoodFacts.ts';
import type {ProductFields} from '../../../src/db/food.ts';

const BASE = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS =
  'code,product_name,product_name_fi,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url';

/** Barcode → product, resolved on the Mac (same mapper as the phone; OFF wants
 *  an identifying User-Agent). Null = unknown code; throws when offline. */
export async function lookupBarcode(barcode: string): Promise<ProductFields | null> {
  const res = await fetch(`${BASE}${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
    headers: {'User-Agent': `Kelomit Companion/${app.getVersion()} (tommi@pico.fi)`, Accept: 'application/json'},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Open Food Facts HTTP ${res.status}`);
  }
  return offToProduct(await res.json(), barcode);
}

export function registerOffIpc(): void {
  ipcMain.handle('off-lookup', (_e, barcode: string) => lookupBarcode(String(barcode).trim()));
}
