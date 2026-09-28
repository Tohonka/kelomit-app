/**
 * Turns a stream of "table X changed" events into occasional whole-DB pushes.
 *
 * - Content tables: push 1.5 s after the last change (a save = one push).
 * - Noisy tables (GPS trail, activity events, …): at most one push per 30 s.
 * - `diag_log` never triggers a push — a failed push logs a diag line, which
 *   would otherwise schedule the next push.
 * - Failures back off: 30 s, 60 s, … capped at 5 min, until a push succeeds
 *   or `kick()` (app foreground, WS reconnect) resets the streak.
 * - A change that lands during a push marks it dirty; one more push follows.
 */
export const CONTENT_DEBOUNCE_MS = 1500;
export const NOISY_DEBOUNCE_MS = 30_000;
export const FAIL_BACKOFF_BASE_MS = 30_000;
export const FAIL_BACKOFF_MAX_MS = 5 * 60_000;

export const NOISY_TABLES: ReadonlySet<string> = new Set([
  'gps_track',
  'activity_events',
  'geofence_events',
  'place_cache',
  'health_daily',
]);
export const IGNORED_TABLES: ReadonlySet<string> = new Set(['diag_log', 'schema_version']);

export function debounceFor(table: string): number | null {
  if (IGNORED_TABLES.has(table)) {
    return null;
  }
  return NOISY_TABLES.has(table) ? NOISY_DEBOUNCE_MS : CONTENT_DEBOUNCE_MS;
}

export function failBackoff(streak: number): number {
  return Math.min(FAIL_BACKOFF_BASE_MS * 2 ** Math.max(0, streak - 1), FAIL_BACKOFF_MAX_MS);
}

export type PushFn = () => Promise<'done' | 'not_configured' | 'failed'>;

export class PushScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dueAt: number | null = null;
  private pushing = false;
  private dirty = false;
  private failStreak = 0;

  constructor(private readonly push: PushFn) {}

  /** A row in `table` changed. */
  notify(table: string, now = Date.now()): void {
    const wait = debounceFor(table);
    if (wait == null) {
      return;
    }
    if (this.pushing) {
      this.dirty = true;
      return;
    }
    const candidate = now + Math.max(wait, this.failStreak ? failBackoff(this.failStreak) : 0);
    if (this.dueAt != null && this.dueAt <= candidate) {
      return; // an earlier push is already scheduled
    }
    this.schedule(candidate - now);
  }

  /** Forget any failure backoff and push soon if anything is pending. */
  kick(): void {
    this.failStreak = 0;
    if (this.pushing) {
      this.dirty = true;
      return;
    }
    if (this.dueAt != null) {
      this.schedule(0);
    }
  }

  /** True while a push is scheduled or running. */
  get pending(): boolean {
    return this.dueAt != null || this.pushing;
  }

  private schedule(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.dueAt = Date.now() + delayMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.dueAt = null;
      this.run().catch(() => {});
    }, delayMs);
  }

  private async run(): Promise<void> {
    this.pushing = true;
    let result: Awaited<ReturnType<PushFn>> = 'failed';
    try {
      result = await this.push();
    } catch {
      result = 'failed';
    } finally {
      this.pushing = false;
    }
    if (result === 'done') {
      this.failStreak = 0;
    } else {
      // 'not_configured' backs off like a failure: nothing to do until the
      // user pairs, and the next content change re-checks anyway.
      this.failStreak += 1;
    }
    if (this.dirty) {
      this.dirty = false;
      this.schedule(
        result === 'done' ? CONTENT_DEBOUNCE_MS : failBackoff(this.failStreak),
      );
    }
  }
}
