jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(() => Promise.resolve()),
}));

import {getSetting} from '../src/db/settings';
import {
  getCompanionConfig,
  normalizeCompanionUrl,
  parsePairPayload,
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
    expect(parsePairPayload(raw)).toEqual({url: 'http://192.168.1.20:8090', token: 'abc_-123'});
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
    });
  });
});
