jest.mock('../src/db/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(() => Promise.resolve()),
}));

import {getSetting, setSetting} from '../src/db/settings';
import {
  getSyncConfig,
  setSyncConfig,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncError,
} from '../src/services/syncSettings';

const mockGet = getSetting as jest.MockedFunction<typeof getSetting>;
const mockSet = setSetting as jest.MockedFunction<typeof setSetting>;

function stubSettings(map: Record<string, string | null>) {
  mockGet.mockImplementation(async (key: string) => map[key] ?? null);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSyncConfig', () => {
  it('returns url and token when both are set', async () => {
    stubSettings({sync_url: 'https://kelmi.pico.fi', sync_token: 'abc'});
    await expect(getSyncConfig()).resolves.toEqual({
      url: 'https://kelmi.pico.fi',
      token: 'abc',
    });
  });

  it('returns null when the token is missing', async () => {
    stubSettings({sync_url: 'https://kelmi.pico.fi'});
    await expect(getSyncConfig()).resolves.toBeNull();
  });

  it('returns null when a value is blank or whitespace', async () => {
    stubSettings({sync_url: '   ', sync_token: 'abc'});
    await expect(getSyncConfig()).resolves.toBeNull();
  });

  it('strips a trailing slash from the url', async () => {
    stubSettings({sync_url: 'https://kelmi.pico.fi/', sync_token: 'abc'});
    await expect(getSyncConfig()).resolves.toEqual({
      url: 'https://kelmi.pico.fi',
      token: 'abc',
    });
  });

  // A bearer token must never ride plain http. Worse: the http→https redirect
  // makes Android's OkHttp DROP the Authorization header, so an http URL is a
  // guaranteed 401 with a perfectly good token.
  it('upgrades an http url to https', async () => {
    stubSettings({sync_url: 'http://kelmi.pico.fi', sync_token: 'abc'});
    await expect(getSyncConfig()).resolves.toEqual({
      url: 'https://kelmi.pico.fi',
      token: 'abc',
    });
  });

  it('prepends https to a bare host', async () => {
    stubSettings({sync_url: 'kelmi.pico.fi', sync_token: 'abc'});
    await expect(getSyncConfig()).resolves.toEqual({
      url: 'https://kelmi.pico.fi',
      token: 'abc',
    });
  });
});

describe('status', () => {
  it('reads both status keys', async () => {
    stubSettings({sync_last_at: '2026-07-26T10:00:00.000Z', sync_last_error: 'boom'});
    await expect(getSyncStatus()).resolves.toEqual({
      lastAt: '2026-07-26T10:00:00.000Z',
      lastError: 'boom',
    });
  });

  it('clears the error on success', async () => {
    await recordSyncSuccess('2026-07-26T10:00:00.000Z');
    expect(mockSet).toHaveBeenCalledWith('sync_last_at', '2026-07-26T10:00:00.000Z');
    expect(mockSet).toHaveBeenCalledWith('sync_last_error', '');
  });

  it('records an error without touching last success time', async () => {
    await recordSyncError('network down');
    expect(mockSet).toHaveBeenCalledWith('sync_last_error', 'network down');
    expect(mockSet).not.toHaveBeenCalledWith('sync_last_at', expect.anything());
  });

  it('truncates very long error messages', async () => {
    await recordSyncError('x'.repeat(600));
    const recorded = mockSet.mock.calls.find(c => c[0] === 'sync_last_error')![1];
    expect(recorded.length).toBe(500);
  });
});

describe('setSyncConfig', () => {
  it('trims both values before writing', async () => {
    await setSyncConfig('  https://kelmi.pico.fi  ', ' abc ');
    expect(mockSet).toHaveBeenCalledWith('sync_url', 'https://kelmi.pico.fi');
    expect(mockSet).toHaveBeenCalledWith('sync_token', 'abc');
  });
});
