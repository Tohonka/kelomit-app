import type {EmitterSubscription} from 'react-native';
import {diag} from '../diag';
import {onBeacon, startBeaconListener, stopBeaconListener} from '../../native/companionBeacon';
import type {BeaconEvent} from '../../native/companionBeacon';
import {getCompanionConfig, setCompanionId, setCompanionUrl} from './settings';
import type {CompanionConfig} from './settings';
import {isCompanionConnected, reconnectCompanion} from './client';

/**
 * Turns desktop beacons into address updates. Pairing (the QR) happens once;
 * from then on the desktop's id is what the phone follows, and its IP is
 * whatever the latest beacon came from.
 */
export type Decision =
  | {action: 'ignore'}
  | {action: 'learn'; id: string}
  | {action: 'switch'; url: string};

const FOUND_TTL_MS = 10_000;

/** Pure. See the decision table in plans_etc/PLAN-20260926-companion-discovery.md. */
export function decide(beacon: BeaconEvent, config: CompanionConfig | null, connected: boolean): Decision {
  if (!config) {
    return {action: 'ignore'};
  }
  const url = `http://${beacon.ip}:${beacon.port}`;
  const sameAddress = url === config.url;
  if (config.id) {
    if (beacon.id !== config.id || sameAddress) {
      return {action: 'ignore'};
    }
    return {action: 'switch', url};
  }
  // Pre-id pairing: the id is only ever learned from a desktop we are
  // actually talking to, so a rejecting dev instance can't poison it.
  if (sameAddress) {
    return connected ? {action: 'learn', id: beacon.id} : {action: 'ignore'};
  }
  return connected ? {action: 'ignore'} : {action: 'switch', url};
}

let sub: EmitterSubscription | null = null;
/* Beacons arrive in pairs (broadcast + multicast); serialize so the second
 * sees the first's write instead of switching (and re-dialling) twice. */
let chain: Promise<void> = Promise.resolve();
let found: {beacon: BeaconEvent; at: number} | null = null;
const foundListeners = new Set<() => void>();

/** The desktop heard from in the last 10 s, for the settings card. */
export function getFoundDesktop(): BeaconEvent | null {
  return found && Date.now() - found.at < FOUND_TTL_MS ? found.beacon : null;
}

export function onFoundDesktop(listener: () => void): () => void {
  foundListeners.add(listener);
  return () => {
    foundListeners.delete(listener);
  };
}

async function handleBeacon(beacon: BeaconEvent): Promise<void> {
  found = {beacon, at: Date.now()};
  for (const l of foundListeners) {
    l();
  }
  const decision = decide(beacon, await getCompanionConfig(), isCompanionConnected());
  if (decision.action === 'learn') {
    await setCompanionId(decision.id);
  } else if (decision.action === 'switch') {
    diag('companion.discovery.switch', decision.url);
    await setCompanionUrl(decision.url);
    await reconnectCompanion();
  }
}

/** Foreground only: the native listener holds a multicast lock. Idempotent. */
export function startCompanionDiscovery(): void {
  if (sub) {
    return;
  }
  sub = onBeacon(b => {
    chain = chain.then(() => handleBeacon(b)).catch(e => diag('companion.discovery.fail', String(e)));
  });
  startBeaconListener().catch(() => {});
}

export function stopCompanionDiscovery(): void {
  sub?.remove();
  sub = null;
  stopBeaconListener().catch(() => {});
}
