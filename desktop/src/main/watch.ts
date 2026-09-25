import {watch} from 'node:fs';
import type {FSWatcher} from 'node:fs';

/**
 * Fires `onChange` shortly after `current.db` is replaced. Ingest renames a
 * new file over it, which shows up as a `rename` event on the directory —
 * watching the directory rather than the file survives that swap.
 */
export function watchCurrentDb(dataDir: string, onChange: () => void, settleMs = 150): FSWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return watch(dataDir, (_event, filename) => {
    if (filename !== 'current.db') {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, settleMs);
  });
}
