import type {QueueSnapshot} from '../queue.ts';
import {classify, isLockScreen} from './signals.ts';
import type {FrontApp, TickState} from './signals.ts';
import type {AppUseStore} from './store.ts';

/**
 * Samples the frontmost app every TICK_MS and files the sample under
 * (today, app, running timer segment) as active or idle time; away time
 * (locked, screensaver, asleep) is not counted. Every FLUSH_MS, and whenever
 * the phone's timer changes, each dirty day's whole totals go to the phone
 * as one `appUse.upsert` command — an unsent item for the same day is
 * rewritten in place, so a phone that is away for hours sees one item, not
 * hundreds.
 */
export const TICK_MS = 5_000;
export const IDLE_AFTER_S = 60;
export const FLUSH_MS = 10 * 60_000;
export const KEEP_DAYS = 7;
const NOTIFY_MS = 60_000;

export interface CollectorStatus {
  front: FrontApp | null;
  state: TickState | 'off';
  sessionFrom: string;
  at: string | null;
}

export interface CollectorDeps {
  store: AppUseStore;
  readFront: () => Promise<FrontApp | null>;
  /** Seconds since the last keyboard/mouse input (powerMonitor.getSystemIdleTime). */
  idleSeconds: () => number;
  /** powerMonitor.getSystemIdleState(1) === 'locked'. */
  locked: () => boolean;
  screensaver: () => Promise<boolean>;
  excluded: () => Set<string>;
  today: () => string;
  queue: {
    push(fn: string, args: unknown[], label: string): string;
    update(id: string, args: unknown[], label?: string): boolean;
    dismissFailed(id: string): void;
    on(event: 'change', handler: (snapshot: QueueSnapshot) => void): unknown;
  };
  /** Live totals moved (throttled to once a minute) — the renderer refreshes. */
  onChanged?: () => void;
}

export class AppUseCollector {
  status: CollectorStatus = {front: null, state: 'off', sessionFrom: '', at: null};
  private away = false;
  private sessionFrom = '';
  /** date → id of that day's not-yet-acked upsert. */
  private pending = new Map<string, string>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private ticking = false;
  private lastNotify = 0;

  constructor(private readonly d: CollectorDeps) {
    d.queue.on('change', s => this.onQueue(s));
  }

  /** suspend / lock-screen → true; resume / unlock-screen → false. */
  setAway(away: boolean): void {
    this.away = away;
  }

  /** The phone's active session (null when none, or offline). A paused
   *  session counts as none. Any change flushes so the timer's chunk lands
   *  right after the note is written. */
  setSession(session: {started_at: string; paused_at?: string | null} | null): void {
    const next = session && !session.paused_at ? session.started_at : '';
    if (next === this.sessionFrom) return;
    this.sessionFrom = next;
    this.flush();
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const front = await this.d.readFront();
      const away = this.away || isLockScreen(front) || this.d.locked() || (await this.d.screensaver());
      const state = classify({away, idleSeconds: this.d.idleSeconds(), idleAfter: IDLE_AFTER_S});
      this.status = {front: state === 'away' ? null : front, state, sessionFrom: this.sessionFrom, at: new Date().toISOString()};
      if (state === 'away' || !front || this.d.excluded().has(front.bundleId)) return;
      this.d.store.add(this.d.today(), front, this.sessionFrom, state, TICK_MS / 1000);
      const now = Date.now();
      if (now - this.lastNotify >= NOTIFY_MS) {
        this.lastNotify = now;
        this.d.onChanged?.();
      }
    } catch (e) {
      // store.add persists to disk; a failed write must not kill the interval.
      console.error('app-use tick failed', e);
    } finally {
      this.ticking = false;
    }
  }

  /** Send every dirty day's totals: rewrite the still-unsent item for that
   *  day in place, else queue a new one. Clean at enqueue; a failure marks
   *  the day dirty again (see onQueue). */
  flush(): void {
    for (const date of this.d.store.dirtyDates()) {
      const args = [date, this.d.store.rows(date)];
      const label = `App use ${date}`;
      const id = this.pending.get(date);
      if (!(id && this.d.queue.update(id, args, label))) {
        this.pending.set(date, this.d.queue.push('appUse.upsert', args, label));
      }
      this.d.store.markClean(date);
    }
    this.d.store.prune(this.d.today(), KEEP_DAYS);
  }

  private onQueue(s: QueueSnapshot): void {
    const failed: string[] = [];
    for (const [date, id] of [...this.pending]) {
      if (s.failed.some(f => f.item.id === id)) {
        this.pending.delete(date);
        this.d.store.markDirty(date);
        failed.push(id);
      } else if (!s.items.some(i => i.id === id)) {
        this.pending.delete(date); // acked
      }
    }
    // A background command must not sit in the failed list; the next cycle retries with fresh totals.
    for (const id of failed) this.d.queue.dismissFailed(id);
  }

  start(): void {
    this.timers = [setInterval(() => void this.tick(), TICK_MS), setInterval(() => this.flush(), FLUSH_MS)];
    this.flush();
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.status = {...this.status, state: 'off'};
    this.flush();
  }
}
