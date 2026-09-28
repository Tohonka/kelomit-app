import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {shiftDate} from '../life.ts';
import type {FrontApp} from './signals.ts';

/**
 * The Mac-side buffer of app-use samples: per day, per (app, timer segment)
 * totals, plus which days changed since they were last sent to the phone.
 * Lives in appuse.json (rewritten atomically after every sample) because
 * current.db is replaced wholesale by every phone push. A day is dropped
 * KEEP_DAYS after it was flushed; a dirty day waits for the phone.
 */
export interface Bucket {
  bundle_id: string;
  app_name: string;
  /** Timer segment start (ISO) the time was collected under; '' = none. */
  session_from: string;
  active_sec: number;
  idle_sec: number;
}

interface Saved {
  days: Record<string, Record<string, Bucket>>;
  dirty: string[];
}

export const bucketKey = (bundleId: string, sessionFrom: string): string => `${bundleId}\u0000${sessionFrom}`;

export class AppUseStore {
  private days: Record<string, Record<string, Bucket>> = {};
  private dirty = new Set<string>();

  /** `file` null = in-memory (tests). */
  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<Saved>;
        const days = saved.days && typeof saved.days === 'object' ? saved.days : {};
        const dirty = Array.isArray(saved.dirty) ? saved.dirty.filter((d): d is string => typeof d === 'string') : [];
        this.days = days;
        this.dirty = new Set(dirty);
      } catch {
        // A corrupt buffer is an empty buffer.
      }
    }
  }

  add(date: string, app: FrontApp, sessionFrom: string, state: 'active' | 'idle', seconds: number): void {
    const day = (this.days[date] ??= {});
    const key = bucketKey(app.bundleId, sessionFrom);
    const b = (day[key] ??= {bundle_id: app.bundleId, app_name: app.name, session_from: sessionFrom, active_sec: 0, idle_sec: 0});
    b.app_name = app.name;
    if (state === 'active') b.active_sec += seconds;
    else b.idle_sec += seconds;
    this.dirty.add(date);
    this.persist();
  }

  rows(date: string): Bucket[] {
    return Object.values(this.days[date] ?? {}).map(b => ({...b}));
  }

  has(date: string): boolean {
    return date in this.days;
  }

  dirtyDates(): string[] {
    return [...this.dirty].sort();
  }

  markClean(date: string): void {
    this.dirty.delete(date);
    this.persist();
  }

  markDirty(date: string): void {
    if (!(date in this.days)) return;
    this.dirty.add(date);
    this.persist();
  }

  /** Forget flushed days older than keepDays. Dirty days are kept whatever their age. */
  prune(today: string, keepDays = 7): void {
    const cutoff = shiftDate(today, -keepDays);
    let changed = false;
    for (const date of Object.keys(this.days)) {
      if (date < cutoff && !this.dirty.has(date)) {
        delete this.days[date];
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private persist(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({days: this.days, dirty: [...this.dirty]} satisfies Saved));
    renameSync(tmp, this.file);
  }
}
