jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(() => Promise.resolve()),
}));

import {getSetting, setSetting} from '../src/db/settings';
import {
  getCompanionConfig,
  normalizeCompanionUrl,
  parsePairPayload,
  setCompanionConfig,
} from '../src/services/companion/settings';

const mockGet = getSetting as jest.MockedFunction<typeof getSetting>;

function stubSettings(map: Record<string, string | null>) {
  mockGet.mockImplementation(async (key: string) => map[key] ?? null);
}

describe('normalizeCompanionUrl', () => {
  it('keeps plain http — the companion is a LAN peer, never https-coerced', () => {
    expect(normalizeCompanionUrl('http://192.168.1.20:8090/')).toBe('http://192.168.1.20:8090');
  });
  it('prefixes http:// on a bare host', () => {
    expect(normalizeCompanionUrl(' 192.168.1.20:8090 ')).toBe('http://192.168.1.20:8090');
  });
  it('leaves an explicit https alone', () => {
    expect(normalizeCompanionUrl('https://mac.local:8090')).toBe('https://mac.local:8090');
  });
});

describe('parsePairPayload', () => {
  it('parses the desktop QR payload', () => {
    const raw =
      'kelomit://pair?url=' +
      encodeURIComponent('http://192.168.1.20:8090') +
      '&token=' +
      encodeURIComponent('abc_-123');
    expect(parsePairPayload(raw)).toEqual({url: 'http://192.168.1.20:8090', token: 'abc_-123', id: null});
  });
  it('rejects other barcodes', () => {
    expect(parsePairPayload('6410405082657')).toBeNull();
    expect(parsePairPayload('kelomit://quickadd/note')).toBeNull();
    expect(parsePairPayload('kelomit://pair?url=http%3A%2F%2Fx')).toBeNull();
  });
});

describe('getCompanionConfig', () => {
  it('returns null until both fields are set', async () => {
    stubSettings({companion_url: 'http://192.168.1.20:8090'});
    await expect(getCompanionConfig()).resolves.toBeNull();
  });
  it('returns the normalised pair', async () => {
    stubSettings({companion_url: '192.168.1.20:8090/', companion_token: 't'});
    await expect(getCompanionConfig()).resolves.toEqual({
      url: 'http://192.168.1.20:8090',
      token: 't',
      id: null,
    });
  });
});

describe('desktop id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parsePairPayload reads the id and tolerates its absence', () => {
    expect(parsePairPayload('kelomit://pair?url=http%3A%2F%2F10.0.0.5%3A8090&token=t&id=abc'))
      .toEqual({url: 'http://10.0.0.5:8090', token: 't', id: 'abc'});
    expect(parsePairPayload('kelomit://pair?url=http%3A%2F%2F10.0.0.5%3A8090&token=t'))
      .toEqual({url: 'http://10.0.0.5:8090', token: 't', id: null});
  });

  it('getCompanionConfig returns the stored id or null', async () => {
    stubSettings({companion_url: 'http://10.0.0.5:8090', companion_token: 't', companion_id: 'abc'});
    expect(await getCompanionConfig()).toEqual({url: 'http://10.0.0.5:8090', token: 't', id: 'abc'});
    stubSettings({companion_url: 'http://10.0.0.5:8090', companion_token: 't'});
    expect((await getCompanionConfig())?.id).toBeNull();
  });

  it('setCompanionConfig leaves the id alone unless one is given', async () => {
    await setCompanionConfig('http://10.0.0.5:8090', 't');
    expect(setSetting).not.toHaveBeenCalledWith('companion_id', expect.anything());
    await setCompanionConfig('http://10.0.0.5:8090', 't', 'abc');
    expect(setSetting).toHaveBeenCalledWith('companion_id', 'abc');
  });

  it('setCompanionConfig clears the id when given null', async () => {
    await setCompanionConfig('http://10.0.0.5:8090', 't', null);
    expect(setSetting).toHaveBeenCalledWith('companion_id', '');
  });
});
