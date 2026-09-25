import {createSocket} from 'node:dgram';
import {hostname} from 'node:os';

/**
 * LAN presence beacon (LocalSend-style, no mDNS). One JSON datagram every
 * 3 s to the limited broadcast address and to a multicast group: APs that
 * filter one usually pass the other. The phone reads the sender IP off the
 * packet, so the payload never carries an address.
 */
export const BEACON_PORT = 53318;
export const BEACON_GROUP = '224.0.0.167';
const INTERVAL_MS = 3000;
const TARGETS = ['255.255.255.255', BEACON_GROUP];

export function beaconPayload(id: string, port: number, name: string = hostname()): Buffer {
  return Buffer.from(JSON.stringify({k: 'kelomit', v: 1, id, port, name}));
}

/** Announce this desktop until the returned stop function is called. */
export function startBeacon(
  id: string,
  port: number,
  opts: {targets?: string[]; beaconPort?: number; intervalMs?: number} = {},
): () => void {
  const targets = opts.targets ?? TARGETS;
  const beaconPort = opts.beaconPort ?? BEACON_PORT;
  const payload = beaconPayload(id, port);
  const socket = createSocket({type: 'udp4', reuseAddr: true});
  let timer: ReturnType<typeof setInterval> | null = null;
  socket.on('error', () => {
    /* a failed send is retried on the next tick */
  });
  socket.bind(0, () => {
    socket.setBroadcast(true);
    try {
      socket.setMulticastTTL(1);
    } catch {
      /* not fatal */
    }
    const tick = () => {
      for (const target of targets) {
        socket.send(payload, beaconPort, target, () => {});
      }
    };
    tick();
    timer = setInterval(tick, opts.intervalMs ?? INTERVAL_MS);
  });
  return () => {
    if (timer) clearInterval(timer);
    socket.close();
  };
}
