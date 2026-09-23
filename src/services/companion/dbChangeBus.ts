/**
 * "Something was written to SQLite" — one hook on the connection, fanned out
 * to listeners. Every write in this app goes through JS (the Kotlin side
 * never opens kelomit.db), so the hook sees everything.
 *
 * Listeners survive a close/reopen of the database (restore-from-backup):
 * `installDbChangeHook` is called again from `initDB`.
 */
type Listener = (table: string) => void;

const listeners = new Set<Listener>();

export function onDbChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface HookableDb {
  updateHook?: (cb: ((params: {table: string}) => void) | null) => void;
}

export function installDbChangeHook(db: HookableDb): void {
  // The jest mock of op-sqlite has no updateHook; nothing to install there.
  if (typeof db.updateHook !== 'function') {
    return;
  }
  db.updateHook(({table}) => {
    for (const l of listeners) {
      try {
        l(table);
      } catch {
        // A listener must never be able to fail a write.
      }
    }
  });
}
