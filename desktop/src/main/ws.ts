import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import type {Server} from 'node:http';
import {WebSocketServer, WebSocket} from 'ws';
import type {ActiveSession} from '../../../src/types/index.ts';

/**
 * The desktop's end of the phone link. One phone at a time; a second
 * connection replaces the first. The phone dials in (bearer token on the
 * upgrade request), says hello, and from then on answers commands with acks.
 */
export interface PhoneState {
  connected: boolean;
  /** ISO of the last frame from the phone. */
  lastSeenAt: string | null;
  appVersion: string | null;
  activeSession: ActiveSession | null;
}

export interface Ack {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class PhoneOfflineError extends Error {
  constructor() {
    super('phone offline');
  }
}

const ACK_TIMEOUT_MS = 20_000;
const PING_MS = 15_000;
const MISSED_PINGS_LIMIT = 2;

export class PhoneLink extends EventEmitter {
  private socket: WebSocket | null = null;
  private pending = new Map<string, {resolve: (a: Ack) => void; timer: ReturnType<typeof setTimeout>}>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private missedPings = 0;
  state: PhoneState = {connected: false, lastSeenAt: null, appVersion: null, activeSession: null};

  constructor(server: Server, private readonly token: string, private readonly pingMs = PING_MS) {
    super();
    const wss = new WebSocketServer({server, path: '/ws'});
    wss.on('connection', (socket, req) => {
      if (req.headers.authorization !== `Bearer ${this.token}`) {
        socket.close(4401, 'unauthorized');
        return;
      }
      this.socket?.close(4000, 'replaced');
      this.socket = socket;
      this.update({connected: true, lastSeenAt: new Date().toISOString()});
      this.startHeartbeat(socket);
      socket.on('message', data => this.onMessage(String(data)));
      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = null;
          this.update({connected: false, activeSession: null});
          this.failPending('phone disconnected');
          this.stopHeartbeat();
        }
      });
      socket.on('error', () => {
        /* close follows */
      });
    });
  }

  /** JSON ping every pingMs; two unanswered pings = the phone is gone.
   *  JSON (not a ws control frame) so the phone's JS sees it too and can
   *  run its own staleness watchdog off the same traffic. */
  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.missedPings = 0;
    this.pingTimer = setInterval(() => {
      if (this.missedPings >= MISSED_PINGS_LIMIT) {
        // ponytail: ws's own 'close' event lags this decision by a tick or
        // more (it waits on the receiver stream to finish), which raced the
        // "dead socket stops showing as connected" goal this task exists
        // for. Declare it dead now; terminate() just tears down the pipe.
        // The close handler's `this.socket === socket` guard makes its own
        // (now redundant) cleanup a no-op when this already ran.
        if (this.socket === socket) {
          this.socket = null;
          this.update({connected: false, activeSession: null});
          this.failPending('phone disconnected');
        }
        this.stopHeartbeat();
        socket.terminate();
        return;
      }
      this.missedPings++;
      socket.send(JSON.stringify({type: 'ping'}));
    }, this.pingMs);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private update(patch: Partial<PhoneState>): void {
    this.state = {...this.state, ...patch};
    this.emit('state', this.state);
  }

  private onMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    this.missedPings = 0;
    const patch: Partial<PhoneState> = {lastSeenAt: new Date().toISOString()};
    if (msg.type === 'hello') {
      patch.appVersion = typeof msg.app_version === 'string' ? msg.app_version : null;
    } else if (msg.type === 'status') {
      patch.activeSession = (msg.active_session as ActiveSession | null) ?? null;
    } else if (msg.type === 'ack' && typeof msg.id === 'string') {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.pending.delete(msg.id);
        waiter.resolve({
          id: msg.id,
          ok: Boolean(msg.ok),
          result: msg.result,
          error: typeof msg.error === 'string' ? msg.error : undefined,
        });
      }
    }
    this.update(patch);
  }

  private failPending(error: string): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({id, ok: false, error});
    }
    this.pending.clear();
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Send one command and wait for its ack. Rejects with PhoneOfflineError
   *  when no phone is connected — the queue decides what to do then. */
  send(fn: string, args: unknown[], id: string = randomUUID()): Promise<Ack> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new PhoneOfflineError());
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({id, ok: false, error: 'ack timeout'});
      }, ACK_TIMEOUT_MS);
      this.pending.set(id, {resolve, timer});
      socket.send(JSON.stringify({type: 'cmd', id, fn, args}));
    });
  }
}
