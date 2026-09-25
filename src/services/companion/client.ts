import {APP_VERSION} from '../../version';
import {diag} from '../diag';
import {getCompanionConfig} from './settings';
import {pushToCompanion} from './push';
import {kickCompanionPush} from './autoPush';
import {runCommand} from './commands';
import type {Command} from './commands';
import type {ActiveSession} from '../../types';

/**
 * The phone's side of the desktop link: one WebSocket the phone opens to the
 * companion (RN ships WebSocket, so no native dependency). Over it the
 * desktop sends commands and the phone answers with acks; on connect the
 * phone pushes its database once so the desktop is never behind.
 *
 * Reconnects with backoff (2 s → 30 s) for as long as the JS runtime lives;
 * Doze may kill it in the background, and the app-foreground kick reconnects.
 */
const BACKOFF_MIN_MS = 2000;
const BACKOFF_MAX_MS = 30_000;

type State = 'idle' | 'connecting' | 'open';

let socket: WebSocket | null = null;
let state: State = 'idle';
let backoffMs = BACKOFF_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
const stateListeners = new Set<(s: State) => void>();

function setState(next: State): void {
  state = next;
  for (const l of stateListeners) {
    l(next);
  }
}

export function onCompanionState(listener: (s: State) => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function isCompanionConnected(): boolean {
  return state === 'open';
}

export function wsUrl(httpUrl: string): string {
  return `${httpUrl.replace(/^http/i, 'ws')}/ws`;
}

function send(msg: unknown): void {
  if (socket && state === 'open') {
    socket.send(JSON.stringify(msg));
  }
}

/** Handles one frame from the desktop. Exported for tests. */
export async function handleMessage(raw: string, reply: (msg: unknown) => void): Promise<void> {
  let msg: {type?: string} & Partial<Command>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === 'cmd' && typeof msg.id === 'string' && typeof msg.fn === 'string') {
    reply(await runCommand({id: msg.id, fn: msg.fn, args: Array.isArray(msg.args) ? msg.args : []}));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectCompanion().catch(() => {});
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
}

/** Open the link if paired. Idempotent while connecting/open. */
export async function connectCompanion(): Promise<void> {
  if (state !== 'idle') {
    return;
  }
  const config = await getCompanionConfig();
  if (!config) {
    return;
  }
  const myGeneration = ++generation;
  setState('connecting');
  // RN's WebSocket accepts connection headers as the third argument.
  const ws = new WebSocket(wsUrl(config.url), [], {
    headers: {Authorization: `Bearer ${config.token}`},
  } as never);
  socket = ws;

  ws.onopen = () => {
    if (myGeneration !== generation) return;
    backoffMs = BACKOFF_MIN_MS;
    setState('open');
    send({type: 'hello', app_version: APP_VERSION});
    // The desktop must never be behind: one push on every connect.
    kickCompanionPush();
    pushToCompanion().catch(() => {});
  };
  ws.onmessage = ev => {
    if (myGeneration !== generation) return;
    handleMessage(String(ev.data), send).catch(e => diag('companion.cmd.fail', String(e)));
  };
  ws.onerror = () => {
    // onclose follows; nothing to do here.
  };
  ws.onclose = () => {
    if (myGeneration !== generation) return;
    socket = null;
    setState('idle');
    scheduleReconnect();
  };
}

/** Drop the link (unpairing) or force a fresh connect (re-pairing). */
export function disconnectCompanion(): void {
  generation++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const ws = socket;
  socket = null;
  setState('idle');
  backoffMs = BACKOFF_MIN_MS;
  try {
    ws?.close();
  } catch {
    // already closed
  }
}

export async function reconnectCompanion(): Promise<void> {
  disconnectCompanion();
  await connectCompanion();
}

/** Ephemeral status for the desktop header — best effort, dropped when offline. */
export function sendCompanionStatus(activeSession: ActiveSession | null): void {
  send({type: 'status', active_session: activeSession, sent_at: new Date().toISOString()});
}
