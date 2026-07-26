jest.mock('../src/services/syncSettings', () => ({
  getSyncConfig: jest.fn(),
  getSyncStatus: jest.fn(() => Promise.resolve({lastAt: null, lastError: null})),
  recordSyncSuccess: jest.fn(() => Promise.resolve()),
  recordSyncError: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import RNFS from 'react-native-fs';
import {
  getSyncConfig,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncError,
} from '../src/services/syncSettings';
import {getDB} from '../src/db/database';
import {runSync, maybeAutoSync} from '../src/services/syncService';

const mockConfig = getSyncConfig as jest.MockedFunction<typeof getSyncConfig>;
const mockStatus = getSyncStatus as jest.MockedFunction<typeof getSyncStatus>;
const mockSuccess = recordSyncSuccess as jest.MockedFunction<typeof recordSyncSuccess>;
const mockError = recordSyncError as jest.MockedFunction<typeof recordSyncError>;
const mockGetDB = getDB as jest.MockedFunction<typeof getDB>;

const execute = jest.fn();
const rnfs = RNFS as unknown as {
  readDir: jest.Mock;
  unlink: jest.Mock;
  exists: jest.Mock;
  uploadFiles: jest.Mock;
};

function dirEntry(name: string) {
  return {name, path: `/mock/docs/kelomit/media/${name}`, isFile: () => true, isDirectory: () => false};
}

function stubManifest(files: string[]) {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({files})}),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  execute.mockResolvedValue({rows: []});
  mockGetDB.mockReturnValue({execute} as never);
  mockConfig.mockResolvedValue({url: 'https://kelmi.pico.fi', token: 'tok'});
  rnfs.exists.mockResolvedValue(false);
  rnfs.unlink.mockResolvedValue(undefined);
  rnfs.readDir.mockResolvedValue([]);
  rnfs.uploadFiles.mockReturnValue({promise: Promise.resolve({statusCode: 200, body: ''})});
  stubManifest([]);
});

describe('runSync guard clauses', () => {
  it('does nothing when sync is not configured', async () => {
    mockConfig.mockResolvedValue(null);
    await expect(runSync()).resolves.toBe('not_configured');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(rnfs.uploadFiles).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it('does not record an error when a sync is already running', async () => {
    rnfs.readDir.mockResolvedValue([dirEntry('new.jpg')]);
    const first = runSync();
    const second = runSync();
    await expect(second).resolves.toBe('failed');
    await first;
    expect(mockError).not.toHaveBeenCalled();
  });
});

describe('snapshot', () => {
  it('vacuums into the cache dir without closing the database', async () => {
    await runSync();
    expect(execute).toHaveBeenCalledWith(
      "VACUUM INTO '/mock/caches/kelomit-sync.db';",
    );
  });

  it('removes a stale snapshot before vacuuming', async () => {
    rnfs.exists.mockResolvedValue(true);
    await runSync();
    expect(rnfs.unlink).toHaveBeenCalledWith('/mock/caches/kelomit-sync.db');
  });
});

describe('media diff', () => {
  it('uploads only files the server lacks and skips video', async () => {
    stubManifest(['already.jpg']);
    rnfs.readDir.mockResolvedValue([
      dirEntry('already.jpg'),
      dirEntry('new.jpg'),
      dirEntry('voice.m4a'),
      dirEntry('voice2.wav'),
      dirEntry('clip.mp4'),
    ]);

    await runSync();

    const uploaded = rnfs.uploadFiles.mock.calls.map(c => c[0].toUrl as string);
    expect(uploaded).toContain('https://kelmi.pico.fi/api/media/new.jpg');
    expect(uploaded).toContain('https://kelmi.pico.fi/api/media/voice.m4a');
    expect(uploaded).toContain('https://kelmi.pico.fi/api/media/voice2.wav');
    expect(uploaded).not.toContain('https://kelmi.pico.fi/api/media/already.jpg');
    expect(uploaded.some(u => u.endsWith('clip.mp4'))).toBe(false);
  });

  it('sends the bearer token on every upload', async () => {
    rnfs.readDir.mockResolvedValue([dirEntry('new.jpg')]);
    await runSync();
    for (const call of rnfs.uploadFiles.mock.calls) {
      expect(call[0].headers.Authorization).toBe('Bearer tok');
    }
  });

  it('uploads all media before the database', async () => {
    rnfs.readDir.mockResolvedValue([dirEntry('new.jpg')]);
    await runSync();
    const urls = rnfs.uploadFiles.mock.calls.map(c => c[0].toUrl as string);
    expect(urls[urls.length - 1]).toBe('https://kelmi.pico.fi/api/sync');
    expect(urls.indexOf('https://kelmi.pico.fi/api/media/new.jpg')).toBeLessThan(
      urls.length - 1,
    );
  });
});

describe('failure handling', () => {
  it('does not push the database when a media upload fails', async () => {
    rnfs.readDir.mockResolvedValue([dirEntry('new.jpg')]);
    rnfs.uploadFiles.mockReturnValue({
      promise: Promise.resolve({statusCode: 500, body: 'nope'}),
    });

    await expect(runSync()).resolves.toBe('failed');

    const urls = rnfs.uploadFiles.mock.calls.map(c => c[0].toUrl as string);
    expect(urls).not.toContain('https://kelmi.pico.fi/api/sync');
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalled();
  });

  it('records a 401 so a wrong token is visible', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 401, json: () => Promise.resolve({})}),
    ) as unknown as typeof fetch;

    await expect(runSync()).resolves.toBe('failed');
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  it('deletes the snapshot even when the run fails', async () => {
    rnfs.exists.mockResolvedValue(true);
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await runSync();
    expect(rnfs.unlink).toHaveBeenCalledWith('/mock/caches/kelomit-sync.db');
  });

  it('does not push the database when the media directory read fails for a real reason', async () => {
    rnfs.readDir.mockRejectedValue(Object.assign(new Error('Permission denied'), {code: 'EACCES'}));

    await expect(runSync()).resolves.toBe('failed');

    expect(rnfs.uploadFiles).not.toHaveBeenCalled();
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
  });

  it('records success with an ISO timestamp on a clean run', async () => {
    await expect(runSync()).resolves.toBe('done');
    expect(mockSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
  });
});

describe('maybeAutoSync', () => {
  it('skips when the last success was under 6 hours ago', async () => {
    mockStatus.mockResolvedValue({
      lastAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastError: null,
    });
    await maybeAutoSync();
    expect(rnfs.uploadFiles).not.toHaveBeenCalled();
  });

  it('runs when the last success was over 6 hours ago', async () => {
    mockStatus.mockResolvedValue({
      lastAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      lastError: null,
    });
    await maybeAutoSync();
    expect(rnfs.uploadFiles).toHaveBeenCalled();
  });

  it('runs when there has never been a successful sync', async () => {
    mockStatus.mockResolvedValue({lastAt: null, lastError: null});
    await maybeAutoSync();
    expect(rnfs.uploadFiles).toHaveBeenCalled();
  });
});
