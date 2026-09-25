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

import {decide} from '../src/services/companion/discovery';

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
