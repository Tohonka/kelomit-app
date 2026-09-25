jest.mock('../src/native/companionBeacon', () => ({
  onBeacon: jest.fn(() => ({remove: jest.fn()})),
  startBeaconListener: jest.fn(async () => {}),
  stopBeaconListener: jest.fn(async () => {}),
}));
jest.mock('../src/services/companion/settings', () => ({
  getCompanionConfig: jest.fn(),
  setCompanionUrl: jest.fn(async () => {}),
  setCompanionId: jest.fn(async () => {}),
}));
jest.mock('../src/services/companion/client', () => ({
  isCompanionConnected: jest.fn(() => false),
  reconnectCompanion: jest.fn(async () => {}),
}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));

import {decide, startCompanionDiscovery, stopCompanionDiscovery} from '../src/services/companion/discovery';
import {onBeacon} from '../src/native/companionBeacon';
import {getCompanionConfig, setCompanionUrl} from '../src/services/companion/settings';
import {reconnectCompanion} from '../src/services/companion/client';

const beacon = {ip: '10.0.0.7', port: 8090, id: 'abc', name: 'mac'};
const at7 = 'http://10.0.0.7:8090';
const at5 = 'http://10.0.0.5:8090';

describe('decide', () => {
  it('ignores everything while unpaired', () => {
    expect(decide(beacon, null, false)).toEqual({action: 'ignore'});
  });

  it('with a stored id: switches only when that id moves', () => {
    expect(decide(beacon, {url: at5, token: 't', id: 'abc'}, true)).toEqual({action: 'switch', url: at7});
    expect(decide(beacon, {url: at7, token: 't', id: 'abc'}, true)).toEqual({action: 'ignore'});
    expect(decide(beacon, {url: at5, token: 't', id: 'other'}, false)).toEqual({action: 'ignore'});
  });

  it('without a stored id: learns it from the live desktop, never yanks a working link', () => {
    expect(decide(beacon, {url: at7, token: 't', id: null}, true)).toEqual({action: 'learn', id: 'abc'});
    expect(decide(beacon, {url: at7, token: 't', id: null}, false)).toEqual({action: 'ignore'});
    expect(decide(beacon, {url: at5, token: 't', id: null}, true)).toEqual({action: 'ignore'});
    expect(decide(beacon, {url: at5, token: 't', id: null}, false)).toEqual({action: 'switch', url: at7});
  });
});

describe('beacon handling', () => {
  afterEach(() => {
    stopCompanionDiscovery();
    jest.clearAllMocks();
  });

  it('a back-to-back duplicate beacon switches only once', async () => {
    // The stored url reads at7 only once the first switch's write landed.
    (getCompanionConfig as jest.Mock).mockImplementation(async () => ({
      url: (setCompanionUrl as jest.Mock).mock.calls.length ? at7 : at5,
      token: 't',
      id: 'abc',
    }));
    startCompanionDiscovery();
    const cb = (onBeacon as jest.Mock).mock.calls[0][0];
    cb(beacon);
    cb(beacon);
    await new Promise<void>(r => setTimeout(r, 0)); // drain the handler chain
    expect(setCompanionUrl).toHaveBeenCalledTimes(1);
    expect(reconnectCompanion).toHaveBeenCalledTimes(1);
  });
});
