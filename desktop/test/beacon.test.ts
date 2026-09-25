import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSocket} from 'node:dgram';
import {once} from 'node:events';
import {beaconPayload, startBeacon} from '../src/main/beacon.ts';

test('beaconPayload is the documented JSON', () => {
  const b = JSON.parse(beaconPayload('abc', 8090, 'mac').toString());
  assert.deepEqual(b, {k: 'kelomit', v: 1, id: 'abc', port: 8090, name: 'mac'});
});

test('startBeacon sends the payload to each target on the beacon port', async () => {
  const listener = createSocket('udp4');
  listener.bind(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  const stop = startBeacon('abc', 8090, {targets: ['127.0.0.1'], beaconPort: port, intervalMs: 20});
  try {
    const [msg, rinfo] = (await once(listener, 'message')) as [Buffer, {address: string}];
    const b = JSON.parse(msg.toString());
    assert.equal(b.k, 'kelomit');
    assert.equal(b.id, 'abc');
    assert.equal(b.port, 8090);
    assert.equal(rinfo.address, '127.0.0.1');
  } finally {
    stop();
    listener.close();
  }
});
