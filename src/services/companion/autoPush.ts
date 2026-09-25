import {onDbChange} from './dbChangeBus';
import {PushScheduler} from './pushScheduler';
import {pushToCompanion} from './push';

let scheduler: PushScheduler | null = null;
let unsubscribe: (() => void) | null = null;

/** Mirror every write to the paired desktop, debounced. Idempotent. */
export function startCompanionAutoPush(): void {
  if (scheduler) {
    return;
  }
  scheduler = new PushScheduler(pushToCompanion);
  unsubscribe = onDbChange(table => scheduler?.notify(table));
}

export function stopCompanionAutoPush(): void {
  unsubscribe?.();
  unsubscribe = null;
  scheduler = null;
}

/** App came to the foreground / the desktop reconnected: drop any failure
 *  backoff and flush what is pending. */
export function kickCompanionPush(): void {
  scheduler?.kick();
}
