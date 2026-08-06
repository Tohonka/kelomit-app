import {getOrCreateDay} from '../db/days';
import {localDateOf} from '../utils/dateUtils';
import {navigationRef} from '../navigation/navigationRef';

const QUICKADD_TYPES = ['note', 'photo', 'voice'] as const;
type QuickAddType = (typeof QUICKADD_TYPES)[number];

/** `kelomit://quickadd/<note|photo|voice>` → its type; anything else → null. */
export function parseDeepLink(url: string | null): {entryType: QuickAddType} | null {
  if (!url) {
    return null;
  }
  const m = url.match(/^kelomit:\/\/quickadd\/([a-z]+)$/);
  const type = m?.[1] as QuickAddType | undefined;
  return type && QUICKADD_TYPES.includes(type) ? {entryType: type} : null;
}

// A cold-start URL can arrive before the NavigationContainer is ready; stash it
// and let onReady flush it.
let _pending: string | null = null;

export async function handleDeepLink(url: string | null): Promise<void> {
  const parsed = parseDeepLink(url);
  if (!parsed) {
    return;
  }
  if (!navigationRef.isReady()) {
    _pending = url;
    return;
  }
  const day = await getOrCreateDay(localDateOf(new Date().toISOString()));
  navigationRef.navigate('QuickAddModal', {
    dayId: day.id,
    entryType: parsed.entryType,
    autoCapture: true,
  });
}

export function flushPendingDeepLink(): void {
  if (_pending) {
    const url = _pending;
    _pending = null;
    handleDeepLink(url).catch(() => {});
  }
}
