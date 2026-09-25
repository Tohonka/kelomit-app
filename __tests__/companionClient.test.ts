jest.mock('../src/services/companion/commands', () => ({
  runCommand: jest.fn(async (cmd: {id: string}) => ({type: 'ack', id: cmd.id, ok: true, result: null})),
}));
jest.mock('../src/services/companion/settings', () => ({getCompanionConfig: jest.fn(), setCompanionUrl: jest.fn()}));
jest.mock('../src/services/companion/push', () => ({pushToCompanion: jest.fn(async () => 'done')}));
jest.mock('../src/services/companion/autoPush', () => ({kickCompanionPush: jest.fn()}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));
jest.mock('../src/version', () => ({APP_VERSION: 'test'}));

import {connectCompanion, disconnectCompanion, handleMessage, wsUrl, STALE_MS} from '../src/services/companion/client';
import {runCommand} from '../src/services/companion/commands';
import {getCompanionConfig} from '../src/services/companion/settings';

describe('wsUrl', () => {
  it('turns the paired http url into the /ws endpoint', () => {
    expect(wsUrl('http://192.168.1.20:8090')).toBe('ws://192.168.1.20:8090/ws');
  });
});

describe('handleMessage', () => {
  it('routes a cmd frame and replies with its ack', async () => {
    const reply = jest.fn();
    await handleMessage(JSON.stringify({type: 'cmd', id: 'k1', fn: 'tags.getOrCreate', args: ['x']}), reply);
    expect(runCommand).toHaveBeenCalledWith({id: 'k1', fn: 'tags.getOrCreate', args: ['x']});
    expect(reply).toHaveBeenCalledWith({type: 'ack', id: 'k1', ok: true, result: null});
  });

  it('ignores garbage and non-command frames', async () => {
    const reply = jest.fn();
    await handleMessage('not json', reply);
    await handleMessage(JSON.stringify({type: 'hello'}), reply);
    await handleMessage(JSON.stringify({type: 'cmd', id: 1, fn: 'x'}), reply);
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('heartbeat', () => {
  it('answers a ping with a pong', async () => {
    const reply = jest.fn();
    await handleMessage(JSON.stringify({type: 'ping'}), reply);
    expect(reply).toHaveBeenCalledWith({type: 'pong'});
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: {data: string}) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.onclose?.();
  }
}

describe('stale-link watchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.instances = [];
    (globalThis as {WebSocket?: unknown}).WebSocket = FakeSocket;
    (getCompanionConfig as jest.Mock).mockResolvedValue({url: 'http://10.0.0.5:8090', token: 't', id: 'abc'});
  });
  afterEach(() => {
    disconnectCompanion();
    jest.useRealTimers();
  });

  it('re-dials after STALE_MS of silence, but not while frames keep arriving', async () => {
    await connectCompanion();
    const first = FakeSocket.instances[0];
    first.onopen?.();
    jest.advanceTimersByTime(STALE_MS - 1000);
    first.onmessage?.({data: JSON.stringify({type: 'ping'})});
    jest.advanceTimersByTime(STALE_MS - 1000);
    expect(FakeSocket.instances).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(2000); // lets reconnect's awaits settle (Jest 29.7)
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('a foreground kick on a stale open link re-dials instead of no-op', async () => {
    await connectCompanion();
    const first = FakeSocket.instances[0];
    first.onopen?.();
    jest.setSystemTime(Date.now() + STALE_MS + 1);
    await connectCompanion();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('concurrent connects open exactly one socket', async () => {
    await Promise.all([connectCompanion(), connectCompanion()]);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
