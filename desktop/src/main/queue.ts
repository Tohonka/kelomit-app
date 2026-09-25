import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {PhoneOfflineError} from './ws.ts';
import type {Ack} from './ws.ts';

/**
 * Durable FIFO of commands for the phone (plan D2). Every desktop edit lands
 * here first; the queue drains serially while a phone is connected and
 * simply waits while it is not. Survives restarts (`queue.json`, rewritten
 * atomically). A not-yet-sent item can be edited or removed in place — that
 * is how a pending create is "edited" without ever needing a temporary id.
 */
export interface QueueItem {
  id: string;
  fn: string;
  args: unknown[];
  /** Human label for the header / failed list ("Edit note 'Lunch'"). */
  label: string;
  createdAt: string;
}

export interface FailedItem {
  item: QueueItem;
  error: string;
  failedAt: string;
}

export interface QueueSnapshot {
  items: QueueItem[];
  failed: FailedItem[];
  /** Id of the item currently in flight, if any. */
  sending: string | null;
}

export interface Sender {
  send(fn: string, args: unknown[], id: string): Promise<Ack>;
}

const RETRY_AFTER_TIMEOUT_MS = 5000;

export class CommandQueue extends EventEmitter {
  private items: QueueItem[] = [];
  private failed: FailedItem[] = [];
  private sending: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string,
    private readonly sender: Sender,
  ) {
    super();
    if (existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<QueueSnapshot>;
        this.items = saved.items ?? [];
        this.failed = saved.failed ?? [];
      } catch {
        // A corrupt file is an empty queue; nothing to recover from it.
      }
    }
  }

  snapshot(): QueueSnapshot {
    return {items: [...this.items], failed: [...this.failed], sending: this.sending};
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({items: this.items, failed: this.failed}, null, 1));
    renameSync(tmp, this.file);
    this.emit('change', this.snapshot());
  }

  /** Enqueue and start draining. Returns the item id. */
  push(fn: string, args: unknown[], label: string): string {
    const item: QueueItem = {id: randomUUID(), fn, args, label, createdAt: new Date().toISOString()};
    this.items.push(item);
    this.persist();
    this.drain();
    return item.id;
  }

  /** Replace a not-yet-sent item's args (editing a pending create). */
  update(id: string, args: unknown[], label?: string): boolean {
    const item = this.items.find(i => i.id === id);
    if (!item || this.sending === id) {
      return false;
    }
    item.args = args;
    if (label) item.label = label;
    this.persist();
    return true;
  }

  /** Drop a not-yet-sent item (deleting a pending create). */
  remove(id: string): boolean {
    if (this.sending === id) {
      return false;
    }
    const before = this.items.length;
    this.items = this.items.filter(i => i.id !== id);
    if (this.items.length === before) {
      return false;
    }
    this.persist();
    return true;
  }

  dismissFailed(id: string): void {
    this.failed = this.failed.filter(f => f.item.id !== id);
    this.persist();
  }

  /** Send items in order until the queue is empty or the phone is gone. */
  drain(): void {
    if (this.sending || this.items.length === 0) {
      return;
    }
    const item = this.items[0];
    this.sending = item.id;
    this.emit('change', this.snapshot());
    this.sender
      .send(item.fn, item.args, item.id)
      .then(ack => this.onAck(item, ack))
      .catch(e => {
        this.sending = null;
        if (!(e instanceof PhoneOfflineError)) {
          this.fail(item, e instanceof Error ? e.message : String(e));
        } else {
          this.emit('change', this.snapshot());
        }
        // Offline: wait for the next drain() (the link's state change).
      });
  }

  private onAck(item: QueueItem, ack: Ack): void {
    this.sending = null;
    if (ack.ok) {
      this.items = this.items.filter(i => i.id !== item.id);
      this.persist();
      this.drain();
      return;
    }
    if (ack.error === 'ack timeout' || ack.error === 'phone disconnected') {
      // The phone may or may not have applied it; re-sending the same id is
      // safe (it re-acks a duplicate). Try again shortly.
      this.emit('change', this.snapshot());
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.drain();
        }, RETRY_AFTER_TIMEOUT_MS);
      }
      return;
    }
    this.fail(item, ack.error ?? 'failed');
  }

  private fail(item: QueueItem, error: string): void {
    this.items = this.items.filter(i => i.id !== item.id);
    this.failed.push({item, error, failedAt: new Date().toISOString()});
    this.persist();
    this.drain();
  }
}
