import {NativeModules} from 'react-native';

interface BarcodeScannerNative {
  scan(): Promise<string | null>;
}

const Native = NativeModules.BarcodeScanner as BarcodeScannerNative | undefined;

export const isBarcodeScannerAvailable = (): boolean => Native != null;

/**
 * Opens Google's code scanner (Play Services UI, no camera permission) and
 * resolves the scanned value. `null` = the user backed out. Throws when the
 * native module is missing (JS-only reload on an older binary, jest) or Play
 * Services fails.
 */
export async function scanBarcode(): Promise<string | null> {
  if (!Native) {
    throw new Error('Barcode scanner unavailable');
  }
  const value = await Native.scan();
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
