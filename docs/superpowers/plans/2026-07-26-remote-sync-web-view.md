# Remote Sync + Read-Only Web View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Android app pushes its whole SQLite database plus photos and voice notes to `kelmi.pico.fi`, where a Node server renders a read-only web view of days, hours, media and routes.

**Architecture:** One-way sync — the phone is the sole writer, so the uploaded SQLite file *is* the server's state. No UUIDs, no tombstones, no change tracking, no conflict resolution. The server lives in `server/` inside this repo and imports the app's own pure modules (`src/utils/hoursUtils.ts`, `src/utils/routeSegments.ts`) so hours shown on the web are computed by the same code as on the phone.

**Tech Stack:** React Native 0.86 / TypeScript strict / `@op-engineering/op-sqlite` / `react-native-fs` (app side). Node 22 / Hono / `better-sqlite3` / `tsx` + `esbuild` (server side). Docker Compose + existing Caddy (deploy).

Spec: `docs/superpowers/specs/2026-07-26-remote-sync-web-view-design.md`

## Global Constraints

- TypeScript strict mode is on. No `any`, no non-null assertions added to satisfy the compiler.
- **No new native dependencies.** The whole app-side feature must be pure JS so it installs over the current build without a native rebuild. `react-native-fs`, already installed, covers file IO and uploads.
- Verification command for app-side work: `npm run check` (lint with `--max-warnings=0`, `tsc --noEmit`, jest `--runInBand`). It must pass before every commit.
- Jest maps `@op-engineering/op-sqlite` to `__mocks__/@op-engineering/op-sqlite.js` and `react-native-fs` to `__mocks__/react-native-fs.ts`. Tests must not import native binaries.
- All user-facing strings go through i18n with keys added to **both** `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts`.
- Server host port is **8090**. Host paths on Playground-1: project at `/home/tommi/kelomit/`, data at `/home/tommi/kelomit/data/`.
- Public host is `kelmi.pico.fi`, proxied through Cloudflare (100 MB request body cap).
- Sync must never block the UI, interrupt GPS tracking, or raise a modal on failure.
- Follow existing patterns: `src/db/` holds raw SQL only, `src/services/` holds logic, settings screens live in `src/screens/settings/` and use `makeSettingsStyles`.

---

## File Structure

**App side (new):**
- `src/services/syncService.ts` — the whole sync flow: snapshot, media diff, uploads, status recording. One responsibility, no UI.
- `src/services/syncSettings.ts` — typed read/write of the four sync settings keys. Kept separate so `syncService` has no direct settings-table SQL and tests can stub it.
- `__tests__/syncService.test.ts`
- `__tests__/syncSettings.test.ts`

**App side (modified):**
- `src/db/migrations.ts` — append migration v21
- `src/screens/settings/DataSettings.tsx` — sync section
- `src/i18n/locales/en.ts`, `src/i18n/locales/fi.ts` — strings
- `App.tsx` — foreground trigger
- `__mocks__/react-native-fs.ts` — add the functions the service uses

**Server side (new, all under `server/`):**
- `server/package.json`, `server/tsconfig.json`
- `server/src/db.ts` — read-only `better-sqlite3` handle over `current.db`, reopened on mtime change
- `server/src/ingest.ts` — validate + atomically install an uploaded DB, snapshot rotation
- `server/src/media.ts` — filename validation, manifest listing, file writes
- `server/src/auth.ts` — bearer-token middleware
- `server/src/routes/api.ts` — the three sync endpoints
- `server/src/routes/web.ts` — the four HTML pages
- `server/src/render.ts` — HTML helpers (escaping, layout)
- `server/src/queries.ts` — all SQL reads against the phone schema
- `server/src/index.ts` — wiring and listen
- `server/test/*.test.ts` — node:test files
- `server/Dockerfile`, `server/compose.yaml`

Rationale for the split: `queries.ts` is the only module that knows the phone's schema, so a schema change on the app side has exactly one place to land server-side. `ingest.ts` and `media.ts` are the two write paths and both need hostile-input handling, so they are isolated from rendering.

---

## Task 1: Sync settings storage

**Files:**
- Modify: `src/db/migrations.ts` (append after the `version: 20` object, before the closing `];`)
- Create: `src/services/syncSettings.ts`
- Test: `__tests__/syncSettings.test.ts`

**Interfaces:**
- Consumes: `getSetting`, `setSetting` from `src/db/settings.ts`
- Produces:
  ```ts
  export interface SyncConfig { url: string; token: string; }
  export interface SyncStatus { lastAt: string | null; lastError: string | null; }
  export async function getSyncConfig(): Promise<SyncConfig | null>;
  export async function setSyncConfig(url: string, token: string): Promise<void>;
  export async function getSyncStatus(): Promise<SyncStatus>;
  export async function recordSyncSuccess(at: string): Promise<void>;
  export async function recordSyncError(message: string): Promise<void>;
  ```
  `getSyncConfig()` returns `null` when either value is missing or blank — that is the "not configured" signal the rest of the feature keys off.

- [ ] **Step 1: Write the failing test**

Create `__tests__/syncSettings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/syncSettings.test.ts`
Expected: FAIL — `Cannot find module '../src/services/syncSettings'`

- [ ] **Step 3: Write the migration**

In `src/db/migrations.ts`, append a new object after the `version: 20` entry:

```ts
  {
    version: 21,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_url', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_token', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_last_at', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_last_error', '')",
    ],
  },
```

- [ ] **Step 4: Write the implementation**

Create `src/services/syncSettings.ts`:

```ts
import {getSetting, setSetting} from '../db/settings';

export interface SyncConfig {
  url: string;
  token: string;
}

export interface SyncStatus {
  lastAt: string | null;
  lastError: string | null;
}

const MAX_ERROR_LEN = 500;

/** Server URL + token, or null when sync is not configured. */
export async function getSyncConfig(): Promise<SyncConfig | null> {
  const url = (await getSetting('sync_url'))?.trim() ?? '';
  const token = (await getSetting('sync_token'))?.trim() ?? '';
  if (!url || !token) {
    return null;
  }
  return {url: url.replace(/\/+$/, ''), token};
}

export async function setSyncConfig(url: string, token: string): Promise<void> {
  await setSetting('sync_url', url.trim());
  await setSetting('sync_token', token.trim());
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return {
    lastAt: (await getSetting('sync_last_at')) || null,
    lastError: (await getSetting('sync_last_error')) || null,
  };
}

export async function recordSyncSuccess(at: string): Promise<void> {
  await setSetting('sync_last_at', at);
  await setSetting('sync_last_error', '');
}

export async function recordSyncError(message: string): Promise<void> {
  await setSetting('sync_last_error', message.slice(0, MAX_ERROR_LEN));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/syncSettings.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations.ts src/services/syncSettings.ts __tests__/syncSettings.test.ts
git commit -m "feat(sync): add sync settings storage and schema v21"
```

---

## Task 2: Sync service

**Files:**
- Create: `src/services/syncService.ts`
- Modify: `__mocks__/react-native-fs.ts`
- Test: `__tests__/syncService.test.ts`

**Interfaces:**
- Consumes: `getSyncConfig`, `recordSyncSuccess`, `recordSyncError`, `getSyncStatus` from Task 1; `getDB` from `src/db/database.ts`
- Produces:
  ```ts
  export type SyncResult = 'done' | 'not_configured' | 'failed';
  export async function runSync(): Promise<SyncResult>;
  export async function maybeAutoSync(): Promise<SyncResult>;
  export const SYNCABLE_EXTENSIONS: readonly string[]; // ['jpg','jpeg','png','wav','m4a']
  ```

**Behaviour being built (read before writing code):**

1. `getSyncConfig()` → if null, return `'not_configured'` and record nothing.
2. `VACUUM INTO '<CachesDirectoryPath>/kelomit-sync.db'` — a consistent snapshot of the live WAL database without closing it or stopping tracking. Delete any stale snapshot first, since `VACUUM INTO` fails if the target exists.
3. `GET {url}/api/media/manifest` → `{files: string[]}`.
4. `readDir` the media directory, keep files whose extension is in `SYNCABLE_EXTENSIONS` and whose name is not already in the manifest.
5. Upload each missing file with `RNFS.uploadFiles({binaryStreamOnly: true})`, sequentially.
6. `POST {url}/api/sync` with the snapshot, also via `uploadFiles` with `binaryStreamOnly`.
7. Record success, delete the snapshot.

Media before DB, always — so the uploaded DB never references a file the server lacks. A media upload failure aborts the run *before* the DB is pushed; the next run re-diffs and continues.

- [ ] **Step 1: Extend the RNFS mock**

Replace `__mocks__/react-native-fs.ts` with:

```ts
// Native module — stub it so pure-logic tests that import modules using RNFS
// (e.g. the transcription provider) can load without the real binary.
export default {
  DocumentDirectoryPath: '/mock/docs',
  CachesDirectoryPath: '/mock/caches',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({promise: Promise.resolve({statusCode: 200})})),
  moveFile: jest.fn(() => Promise.resolve()),
  readDir: jest.fn(() => Promise.resolve([])),
  stat: jest.fn(() => Promise.resolve({size: 1024})),
  uploadFiles: jest.fn(() => ({
    promise: Promise.resolve({statusCode: 200, body: ''}),
  })),
};
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/syncService.test.ts`:

```ts
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
  global.fetch = jest.fn(() =>
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
    expect(global.fetch).not.toHaveBeenCalled();
    expect(rnfs.uploadFiles).not.toHaveBeenCalled();
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
      dirEntry('clip.mp4'),
    ]);

    await runSync();

    const uploaded = rnfs.uploadFiles.mock.calls.map(c => c[0].toUrl as string);
    expect(uploaded).toContain('https://kelmi.pico.fi/api/media/new.jpg');
    expect(uploaded).toContain('https://kelmi.pico.fi/api/media/voice.m4a');
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
    global.fetch = jest.fn(() =>
      Promise.resolve({ok: false, status: 401, json: () => Promise.resolve({})}),
    ) as unknown as typeof fetch;

    await expect(runSync()).resolves.toBe('failed');
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  it('deletes the snapshot even when the run fails', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    await runSync();
    expect(rnfs.unlink).toHaveBeenCalledWith('/mock/caches/kelomit-sync.db');
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/syncService.test.ts`
Expected: FAIL — `Cannot find module '../src/services/syncService'`

- [ ] **Step 4: Write the implementation**

Create `src/services/syncService.ts`:

```ts
import RNFS from 'react-native-fs';
import {getDB} from '../db/database';
import {
  getSyncConfig,
  getSyncStatus,
  recordSyncSuccess,
  recordSyncError,
} from './syncSettings';

export type SyncResult = 'done' | 'not_configured' | 'failed';

/** Extensions we push. Video is deliberately excluded — see the design doc. */
export const SYNCABLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'wav', 'm4a'] as const;

const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/media`;
const SNAPSHOT_PATH = `${RNFS.CachesDirectoryPath}/kelomit-sync.db`;
const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

let running = false;

function isSyncable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (SYNCABLE_EXTENSIONS as readonly string[]).includes(ext);
}

/** Consistent snapshot of the live WAL database. Does not close the DB and does
 *  not interrupt tracking, unlike backupService's export. */
async function writeSnapshot(): Promise<void> {
  if (await RNFS.exists(SNAPSHOT_PATH)) {
    await RNFS.unlink(SNAPSHOT_PATH);
  }
  await getDB().execute(`VACUUM INTO '${SNAPSHOT_PATH}';`);
}

async function fetchManifest(url: string, token: string): Promise<Set<string>> {
  const res = await fetch(`${url}/api/media/manifest`, {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    throw new Error(`manifest failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {files?: string[]};
  return new Set(body.files ?? []);
}

async function upload(path: string, toUrl: string, token: string): Promise<void> {
  const res = await RNFS.uploadFiles({
    toUrl,
    method: 'POST',
    binaryStreamOnly: true,
    headers: {Authorization: `Bearer ${token}`},
    files: [{name: 'file', filename: path.split('/').pop() ?? 'file', filepath: path}],
  }).promise;
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`upload failed: HTTP ${res.statusCode} ${toUrl}`);
  }
}

async function uploadMissingMedia(
  url: string,
  token: string,
  present: Set<string>,
): Promise<void> {
  if (!(await RNFS.exists(MEDIA_DIR))) {
    return;
  }
  const items = await RNFS.readDir(MEDIA_DIR);
  for (const item of items) {
    if (!item.isFile() || !isSyncable(item.name) || present.has(item.name)) {
      continue;
    }
    await upload(item.path, `${url}/api/media/${item.name}`, token);
  }
}

/** Push everything to the server. Never throws — failures are recorded and
 *  surfaced in Settings only. */
export async function runSync(): Promise<SyncResult> {
  const config = await getSyncConfig();
  if (!config) {
    return 'not_configured';
  }
  if (running) {
    return 'failed';
  }
  running = true;
  try {
    await writeSnapshot();
    const present = await fetchManifest(config.url, config.token);
    // Media first: the DB must never reference a file the server lacks.
    await uploadMissingMedia(config.url, config.token, present);
    await upload(SNAPSHOT_PATH, `${config.url}/api/sync`, config.token);
    await recordSyncSuccess(new Date().toISOString());
    return 'done';
  } catch (e) {
    await recordSyncError(e instanceof Error ? e.message : String(e));
    return 'failed';
  } finally {
    running = false;
    if (await RNFS.exists(SNAPSHOT_PATH)) {
      await RNFS.unlink(SNAPSHOT_PATH).catch(() => {});
    }
  }
}

/** Foreground trigger: sync at most every 6 hours. */
export async function maybeAutoSync(): Promise<SyncResult> {
  const {lastAt} = await getSyncStatus();
  if (lastAt) {
    const age = Date.now() - new Date(lastAt).getTime();
    if (Number.isFinite(age) && age < AUTO_SYNC_INTERVAL_MS) {
      return 'done';
    }
  }
  return runSync();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/syncService.test.ts`
Expected: PASS, 13 tests

Note: `runSync`'s `finally` block deletes the snapshot, so the "deletes the snapshot even when the run fails" test relies on `RNFS.exists` being stubbed. In `beforeEach` it resolves `false`; that test passes because `unlink` is also called by `writeSnapshot` only when `exists` is true. If it fails, set `rnfs.exists.mockResolvedValue(true)` inside that single test rather than changing the implementation.

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add src/services/syncService.ts __tests__/syncService.test.ts __mocks__/react-native-fs.ts
git commit -m "feat(sync): add whole-database sync service"
```

---

## Task 3: Settings UI and foreground trigger

**Files:**
- Modify: `src/screens/settings/DataSettings.tsx`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/fi.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `runSync`, `maybeAutoSync` from Task 2; `getSyncConfig`, `setSyncConfig`, `getSyncStatus` from Task 1

- [ ] **Step 1: Add the i18n strings**

In `src/i18n/locales/en.ts`, inside the `settings` object:

```ts
    syncSection: 'Remote sync',
    syncServerUrl: 'Server URL',
    syncToken: 'Access token',
    syncNow: 'Sync now',
    syncing: 'Syncing…',
    syncNeverRun: 'Never synced',
    syncLastAt: 'Last sync: {{when}}',
    syncNotConfigured: 'Set a server URL and token first',
    syncFailed: 'Last sync failed: {{error}}',
    syncDone: 'Sync complete',
    syncSave: 'Save',
```

In `src/i18n/locales/fi.ts`, the same keys:

```ts
    syncSection: 'Etäsynkronointi',
    syncServerUrl: 'Palvelimen osoite',
    syncToken: 'Käyttötunniste',
    syncNow: 'Synkronoi nyt',
    syncing: 'Synkronoidaan…',
    syncNeverRun: 'Ei synkronoitu',
    syncLastAt: 'Viimeksi: {{when}}',
    syncNotConfigured: 'Aseta ensin palvelimen osoite ja tunniste',
    syncFailed: 'Synkronointi epäonnistui: {{error}}',
    syncDone: 'Synkronointi valmis',
    syncSave: 'Tallenna',
```

- [ ] **Step 2: Add the sync section to DataSettings**

In `src/screens/settings/DataSettings.tsx`, add to the imports:

```ts
import {TextInput} from 'react-native';
import {useEffect} from 'react';
import {runSync} from '../../services/syncService';
import {getSyncConfig, setSyncConfig, getSyncStatus} from '../../services/syncSettings';
```

Add to `makeLocalStyles`:

```ts
    syncInput: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      color: c.textPrimary,
      fontSize: typography.sizes.base,
    },
    syncStatus: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.sizes.sm,
      color: c.textMuted,
    },
```

Add state and handlers inside the component, next to the existing `backupBusy` state:

```ts
  const [syncUrl, setSyncUrl] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');

  const refreshSyncStatus = async () => {
    const {lastAt, lastError} = await getSyncStatus();
    if (lastError) {
      setSyncStatusText(t('settings.syncFailed', {error: lastError}));
    } else if (lastAt) {
      setSyncStatusText(
        t('settings.syncLastAt', {
          when: format(new Date(lastAt), 'd.M.yyyy HH:mm', {
            locale: getDateFnsLocale(language),
          }),
        }),
      );
    } else {
      setSyncStatusText(t('settings.syncNeverRun'));
    }
  };

  useEffect(() => {
    (async () => {
      const config = await getSyncConfig();
      if (config) {
        setSyncUrl(config.url);
        setSyncToken(config.token);
      }
      await refreshSyncStatus();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSync = async () => {
    await setSyncConfig(syncUrl, syncToken);
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    try {
      await handleSaveSync();
      const result = await runSync();
      if (result === 'not_configured') {
        Alert.alert(t('settings.syncSection'), t('settings.syncNotConfigured'));
      } else if (result === 'done') {
        Alert.alert(t('settings.syncSection'), t('settings.syncDone'));
      }
      await refreshSyncStatus();
    } finally {
      setSyncBusy(false);
    }
  };
```

Add the section markup at the end of the `ScrollView`, after the restore row:

```tsx
        <Text style={styles.sectionHeader}>{t('settings.syncSection')}</Text>

        <TextInput
          style={local.syncInput}
          value={syncUrl}
          onChangeText={setSyncUrl}
          onBlur={handleSaveSync}
          placeholder={t('settings.syncServerUrl')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          style={local.syncInput}
          value={syncToken}
          onChangeText={setSyncToken}
          onBlur={handleSaveSync}
          placeholder={t('settings.syncToken')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Text style={local.syncStatus}>{syncStatusText}</Text>

        <TouchableOpacity style={styles.row} onPress={handleSyncNow} disabled={syncBusy}>
          <Text style={styles.rowLabel}>
            {syncBusy ? t('settings.syncing') : t('settings.syncNow')}
          </Text>
          <Text style={styles.rowCaret}>{syncBusy ? '…' : '›'}</Text>
        </TouchableOpacity>
```

- [ ] **Step 3: Add the foreground trigger**

In `App.tsx`, add the import:

```ts
import {maybeAutoSync} from './src/services/syncService';
```

Find the existing `AppState` listener. If one exists, add `maybeAutoSync()` to its `'active'` branch. If none exists, add this effect alongside the other top-level effects:

```ts
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        // Fire and forget — sync failures never surface here.
        maybeAutoSync();
      }
    });
    return () => sub.remove();
  }, []);
```

Import `AppState` from `react-native` if it is not already imported.

- [ ] **Step 4: Full check**

Run: `npm run check`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/DataSettings.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts App.tsx
git commit -m "feat(sync): add sync settings UI and foreground trigger"
```

---

## Task 4: Server scaffold and ingest

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/ingest.ts`, `server/src/index.ts`
- Test: `server/test/ingest.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IngestPaths { dataDir: string; }
  export async function ingestDatabase(body: Buffer, paths: IngestPaths): Promise<void>;
  export function pruneSnapshots(dataDir: string, keep: number): void;
  ```
  `ingestDatabase` throws `Error('invalid database')` on a body that is not a readable Kelomit SQLite file. It must leave `current.db` untouched when it throws.

- [ ] **Step 1: Create the package**

`server/package.json`:

```json
{
  "name": "kelomit-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "better-sqlite3": "^11.7.0",
    "date-fns": "^4.1.0",
    "hono": "^4.6.14"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.8.3"
  },
  "engines": {"node": ">= 22.11.0"}
}
```

`server/tsconfig.json` — `rootDir` is the repo root so the app's shared utils compile in:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "..",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "../src/utils/hoursUtils.ts", "../src/types/index.ts"]
}
```

Run: `cd server && npm install`
Expected: installs without errors

- [ ] **Step 2: Write the failing test**

`server/test/ingest.test.ts`:

```ts
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {ingestDatabase, pruneSnapshots} from '../src/ingest.ts';

let dataDir: string;

/** A minimal but valid Kelomit database, as a buffer. */
function validDbBuffer(): Buffer {
  const p = join(dataDir, 'fixture.db');
  const db = new Database(p);
  db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
  db.exec('INSERT INTO schema_version (version) VALUES (21)');
  db.close();
  const buf = readFileSync(p);
  rmSync(p);
  return buf;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-ingest-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('installs a valid upload as current.db', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  assert.ok(existsSync(join(dataDir, 'current.db')));
  const db = new Database(join(dataDir, 'current.db'), {readonly: true});
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as {v: number};
  assert.equal(row.v, 21);
  db.close();
});

test('keeps a timestamped snapshot', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  const snaps = readdirSync(join(dataDir, 'snapshots'));
  assert.equal(snaps.length, 1);
  assert.match(snaps[0], /^kelomit-\d{8}-\d{6}\.db$/);
});

test('rejects a body that is not a database and leaves current.db intact', async () => {
  await ingestDatabase(validDbBuffer(), {dataDir});
  const before = readFileSync(join(dataDir, 'current.db'));

  await assert.rejects(
    () => ingestDatabase(Buffer.from('this is not sqlite'), {dataDir}),
    /invalid database/,
  );

  assert.deepEqual(readFileSync(join(dataDir, 'current.db')), before);
});

test('rejects a truncated sqlite file', async () => {
  const truncated = validDbBuffer().subarray(0, 100);
  await assert.rejects(() => ingestDatabase(truncated, {dataDir}), /invalid database/);
  assert.ok(!existsSync(join(dataDir, 'current.db')));
});

test('rejects a database with no schema_version table', async () => {
  const p = join(dataDir, 'wrong.db');
  const db = new Database(p);
  db.exec('CREATE TABLE unrelated (id INTEGER)');
  db.close();
  const buf = readFileSync(p);
  rmSync(p);
  await assert.rejects(() => ingestDatabase(buf, {dataDir}), /invalid database/);
});

test('pruneSnapshots keeps only the newest N', () => {
  const snapDir = join(dataDir, 'snapshots');
  writeFileSync(join(dataDir, 'ignore-me'), 'x');
  mkdirSync(snapDir, {recursive: true});
  for (const name of ['kelomit-20260101-000000.db', 'kelomit-20260102-000000.db', 'kelomit-20260103-000000.db']) {
    writeFileSync(join(snapDir, name), 'x');
  }

  pruneSnapshots(dataDir, 2);

  const left = readdirSync(snapDir).sort();
  assert.deepEqual(left, ['kelomit-20260102-000000.db', 'kelomit-20260103-000000.db']);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/ingest.ts`

- [ ] **Step 4: Write the implementation**

`server/src/ingest.ts`:

```ts
import {
  writeFileSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';

export interface IngestPaths {
  dataDir: string;
}

const SNAPSHOT_KEEP = 30;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Open the candidate read-only and prove it is a Kelomit database. Anything
 *  that throws here means the upload never reaches current.db. */
function validate(path: string): void {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, {readonly: true, fileMustExist: true});
    const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as
      | {v: number | null}
      | undefined;
    if (!row || row.v == null) {
      throw new Error('no schema version');
    }
  } catch (e) {
    throw new Error(`invalid database: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    db?.close();
  }
}

export function pruneSnapshots(dataDir: string, keep = SNAPSHOT_KEEP): void {
  const dir = join(dataDir, 'snapshots');
  if (!existsSync(dir)) {
    return;
  }
  const names = readdirSync(dir)
    .filter(n => /^kelomit-\d{8}-\d{6}\.db$/.test(n))
    .sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    rmSync(join(dir, name), {force: true});
  }
}

/** Validate then atomically install an uploaded database. */
export async function ingestDatabase(body: Buffer, paths: IngestPaths): Promise<void> {
  const {dataDir} = paths;
  mkdirSync(join(dataDir, 'snapshots'), {recursive: true});

  const incoming = join(dataDir, 'incoming.db');
  writeFileSync(incoming, body);

  try {
    validate(incoming);
  } catch (e) {
    rmSync(incoming, {force: true});
    throw e;
  }

  copyFileSync(incoming, join(dataDir, 'snapshots', `kelomit-${stamp()}.db`));
  // rename is atomic on the same filesystem — a reader never sees a partial file.
  renameSync(incoming, join(dataDir, 'current.db'));
  pruneSnapshots(dataDir);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/src/ingest.ts server/test/ingest.test.ts
git commit -m "feat(server): add database ingest with atomic install"
```

---

## Task 5: Media storage and auth

**Files:**
- Create: `server/src/media.ts`, `server/src/auth.ts`
- Test: `server/test/media.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // media.ts
  export function isSafeMediaName(name: string): boolean;
  export function listMedia(dataDir: string): string[];
  export function saveMedia(dataDir: string, name: string, body: Buffer): void;
  export function mediaPath(dataDir: string, name: string): string;

  // auth.ts
  export function bearerAuth(token: string): MiddlewareHandler;
  ```

- [ ] **Step 1: Write the failing test**

`server/test/media.test.ts`:

```ts
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isSafeMediaName, listMedia, saveMedia} from '../src/media.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-media-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('accepts ordinary media filenames', () => {
  assert.ok(isSafeMediaName('photo_1719.jpg'));
  assert.ok(isSafeMediaName('voice-2.m4a'));
  assert.ok(isSafeMediaName('IMG.JPEG'));
});

test('rejects traversal and separators', () => {
  assert.ok(!isSafeMediaName('../../etc/passwd'));
  assert.ok(!isSafeMediaName('a/b.jpg'));
  assert.ok(!isSafeMediaName('..'));
  assert.ok(!isSafeMediaName('a\\b.jpg'));
  assert.ok(!isSafeMediaName(''));
});

test('rejects extensions we do not sync', () => {
  assert.ok(!isSafeMediaName('clip.mp4'));
  assert.ok(!isSafeMediaName('shell.sh'));
  assert.ok(!isSafeMediaName('noextension'));
});

test('saveMedia writes into the media dir', () => {
  saveMedia(dataDir, 'photo.jpg', Buffer.from('bytes'));
  assert.equal(readFileSync(join(dataDir, 'media', 'photo.jpg'), 'utf8'), 'bytes');
});

test('saveMedia refuses an unsafe name', () => {
  assert.throws(() => saveMedia(dataDir, '../escape.jpg', Buffer.from('x')), /unsafe/);
  assert.ok(!existsSync(join(dataDir, '..', 'escape.jpg')));
});

test('listMedia returns filenames, empty when the dir is absent', () => {
  assert.deepEqual(listMedia(dataDir), []);
  mkdirSync(join(dataDir, 'media'), {recursive: true});
  writeFileSync(join(dataDir, 'media', 'a.jpg'), 'x');
  writeFileSync(join(dataDir, 'media', 'b.m4a'), 'x');
  assert.deepEqual(listMedia(dataDir).sort(), ['a.jpg', 'b.m4a']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/media.ts`

- [ ] **Step 3: Write media.ts**

```ts
import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'wav', 'm4a'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** Hostile input gate: the filename arrives straight off the wire. */
export function isSafeMediaName(name: string): boolean {
  if (!name || !SAFE_NAME.test(name) || name.includes('..')) {
    return false;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext !== name.toLowerCase() && ALLOWED_EXTENSIONS.includes(ext);
}

export function mediaPath(dataDir: string, name: string): string {
  if (!isSafeMediaName(name)) {
    throw new Error(`unsafe media name: ${name}`);
  }
  return join(dataDir, 'media', name);
}

export function listMedia(dataDir: string): string[] {
  const dir = join(dataDir, 'media');
  return existsSync(dir) ? readdirSync(dir) : [];
}

export function saveMedia(dataDir: string, name: string, body: Buffer): void {
  const path = mediaPath(dataDir, name);
  mkdirSync(join(dataDir, 'media'), {recursive: true});
  writeFileSync(path, body);
}
```

Note the `ext !== name.toLowerCase()` guard: `'noextension'.split('.').pop()` returns the whole string, so without it a bare word would pass whenever it matched an allowed extension.

- [ ] **Step 4: Write auth.ts**

```ts
import type {MiddlewareHandler} from 'hono';

/** Constant-time-ish bearer check. The token is a single shared secret; there
 *  is one user. */
export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    if (header !== `Bearer ${token}`) {
      return c.json({error: 'unauthorized'}, 401);
    }
    await next();
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS, 12 tests total (6 ingest + 6 media)

- [ ] **Step 6: Commit**

```bash
git add server/src/media.ts server/src/auth.ts server/test/media.test.ts
git commit -m "feat(server): add media storage and bearer auth"
```

---

## Task 6: API routes

**Files:**
- Create: `server/src/routes/api.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/api.test.ts`

**Interfaces:**
- Consumes: `ingestDatabase` (Task 4), `listMedia`/`saveMedia` (Task 5), `bearerAuth` (Task 5)
- Produces:
  ```ts
  export function apiRoutes(opts: {dataDir: string; token: string}): Hono;
  ```

- [ ] **Step 1: Write the failing test**

`server/test/api.test.ts`:

```ts
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {apiRoutes} from '../src/routes/api.ts';

let dataDir: string;
let app: ReturnType<typeof apiRoutes>;
const TOKEN = 'test-token';

function validDbBuffer(): Buffer {
  const p = join(dataDir, 'fixture.db');
  const db = new Database(p);
  db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)');
  db.exec('INSERT INTO schema_version (version) VALUES (21)');
  db.close();
  const buf = readFileSync(p);
  rmSync(p);
  return buf;
}

function authed(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {})},
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-api-'));
  app = apiRoutes({dataDir, token: TOKEN});
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('manifest requires a token', async () => {
  const res = await app.fetch(new Request('http://localhost/api/media/manifest'));
  assert.equal(res.status, 401);
});

test('manifest rejects a wrong token', async () => {
  const res = await app.fetch(
    new Request('http://localhost/api/media/manifest', {
      headers: {Authorization: 'Bearer wrong'},
    }),
  );
  assert.equal(res.status, 401);
});

test('manifest lists uploaded media', async () => {
  await app.fetch(authed('/api/media/photo.jpg', {method: 'POST', body: 'bytes'}));
  const res = await app.fetch(authed('/api/media/manifest'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {files: ['photo.jpg']});
});

test('media upload rejects traversal', async () => {
  const res = await app.fetch(
    authed('/api/media/..%2F..%2Fetc%2Fpasswd', {method: 'POST', body: 'x'}),
  );
  assert.equal(res.status, 400);
  assert.ok(!existsSync(join(dataDir, '..', 'passwd')));
});

test('media upload rejects video', async () => {
  const res = await app.fetch(authed('/api/media/clip.mp4', {method: 'POST', body: 'x'}));
  assert.equal(res.status, 400);
});

test('sync installs a valid database', async () => {
  const res = await app.fetch(
    authed('/api/sync', {method: 'POST', body: validDbBuffer()}),
  );
  assert.equal(res.status, 200);
  assert.ok(existsSync(join(dataDir, 'current.db')));
});

test('sync rejects garbage without touching current.db', async () => {
  await app.fetch(authed('/api/sync', {method: 'POST', body: validDbBuffer()}));
  const before = readFileSync(join(dataDir, 'current.db'));

  const res = await app.fetch(
    authed('/api/sync', {method: 'POST', body: 'not a database'}),
  );

  assert.equal(res.status, 400);
  assert.deepEqual(readFileSync(join(dataDir, 'current.db')), before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/routes/api.ts`

- [ ] **Step 3: Write the implementation**

`server/src/routes/api.ts`:

```ts
import {Hono} from 'hono';
import {bearerAuth} from '../auth.ts';
import {ingestDatabase} from '../ingest.ts';
import {listMedia, saveMedia, isSafeMediaName} from '../media.ts';

export function apiRoutes(opts: {dataDir: string; token: string}): Hono {
  const app = new Hono();
  app.use('/api/*', bearerAuth(opts.token));

  app.get('/api/media/manifest', c => c.json({files: listMedia(opts.dataDir)}));

  app.post('/api/media/:filename', async c => {
    const name = c.req.param('filename');
    if (!isSafeMediaName(name)) {
      return c.json({error: 'bad filename'}, 400);
    }
    const body = Buffer.from(await c.req.arrayBuffer());
    saveMedia(opts.dataDir, name, body);
    return c.json({ok: true});
  });

  app.post('/api/sync', async c => {
    const body = Buffer.from(await c.req.arrayBuffer());
    try {
      await ingestDatabase(body, {dataDir: opts.dataDir});
    } catch (e) {
      return c.json({error: e instanceof Error ? e.message : String(e)}, 400);
    }
    return c.json({ok: true});
  });

  return app;
}
```

- [ ] **Step 4: Write index.ts**

`server/src/index.ts`:

```ts
import {serve} from '@hono/node-server';
import {Hono} from 'hono';
import {apiRoutes} from './routes/api.ts';

const dataDir = process.env.KELOMIT_DATA_DIR ?? '/data';
const token = process.env.KELOMIT_SYNC_TOKEN;
const port = Number(process.env.PORT ?? 8090);

if (!token) {
  throw new Error('KELOMIT_SYNC_TOKEN is required');
}

const app = new Hono();
app.route('/', apiRoutes({dataDir, token}));
app.get('/healthz', c => c.text('ok'));

serve({fetch: app.fetch, port});
console.log(`kelomit server listening on ${port}, data=${dataDir}`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS, 19 tests total

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/api.ts server/src/index.ts server/test/api.test.ts
git commit -m "feat(server): add sync API routes"
```

---

## Task 7: Read layer over the phone schema

**Files:**
- Create: `server/src/db.ts`, `server/src/queries.ts`
- Test: `server/test/queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // db.ts
  export function openCurrent(dataDir: string): Database.Database | null;

  // queries.ts — Day, Entry types come from ../../src/types
  export interface DaySummary { date: string; startedAt: string | null; endedAt: string | null; entryCount: number; }
  export function listDays(db: Database.Database, limit: number): DaySummary[];
  export function listDaysInRange(db: Database.Database, from: string, to: string): DaySummary[];
  export function getDay(db: Database.Database, date: string): Day | null;
  export function getEntries(db: Database.Database, dayId: number): Entry[];
  export function getEntryMedia(db: Database.Database, dayId: number): MediaRow[];
  export function getRouteSegments(db: Database.Database, dayId: number): RouteSegmentRow[];
  export function getRouteStops(db: Database.Database, dayId: number): RouteStopRow[];
  ```
  `openCurrent` returns `null` when `current.db` does not exist yet — a freshly deployed server that has never received a sync must render an empty state, not crash.

- [ ] **Step 1: Write the failing test**

`server/test/queries.test.ts`:

```ts
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {openCurrent} from '../src/db.ts';
import {listDays, listDaysInRange, getDay, getEntries} from '../src/queries.ts';

let dataDir: string;

function seed(): Database.Database {
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, notes TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at) VALUES
      (1, '2026-07-25', '2026-07-25T08:00:00.000Z', '2026-07-25T16:00:00.000Z'),
      (2, '2026-07-26', '2026-07-26T09:00:00.000Z', NULL);
    INSERT INTO entries (day_id, entry_type, activity_type, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', 'Morning', '2026-07-25T08:00:00.000Z', '2026-07-25T12:00:00.000Z', '2026-07-25T08:00:00.000Z');
  `);
  return db;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-q-'));
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('openCurrent returns null before the first sync', () => {
  assert.equal(openCurrent(dataDir), null);
});

test('lists days newest first', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  const days = listDays(db, 10);
  assert.deepEqual(days.map(d => d.date), ['2026-07-26', '2026-07-25']);
  assert.equal(days[1].entryCount, 1);
});

test('getDay returns null for an unknown date', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.equal(getDay(db, '1999-01-01'), null);
});

test('listDaysInRange filters by date bounds inclusively', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.deepEqual(
    listDaysInRange(db, '2026-07-25', '2026-07-25').map(d => d.date),
    ['2026-07-25'],
  );
  assert.deepEqual(listDaysInRange(db, '2026-08-01', '2026-08-31'), []);
});

test('getEntries returns the day entries', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  const entries = getEntries(db, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Morning');
});

test('the handle is read-only', () => {
  seed().close();
  const db = openCurrent(dataDir)!;
  assert.throws(() => db.exec("INSERT INTO days (date) VALUES ('2026-07-27')"), /readonly/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/db.ts`

- [ ] **Step 3: Write db.ts**

```ts
import {existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import Database from 'better-sqlite3';

let cached: {path: string; mtimeMs: number; db: Database.Database} | null = null;

/** Read-only handle over the last synced database, reopened whenever the file
 *  changes so a sync is picked up without a restart. Null before first sync. */
export function openCurrent(dataDir: string): Database.Database | null {
  const path = join(dataDir, 'current.db');
  if (!existsSync(path)) {
    return null;
  }
  const {mtimeMs} = statSync(path);
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) {
    return cached.db;
  }
  cached?.db.close();
  const db = new Database(path, {readonly: true, fileMustExist: true});
  cached = {path, mtimeMs, db};
  return db;
}
```

- [ ] **Step 4: Write queries.ts**

```ts
import type Database from 'better-sqlite3';
import type {Day, Entry} from '../../src/types/index.ts';

export interface DaySummary {
  date: string;
  startedAt: string | null;
  endedAt: string | null;
  entryCount: number;
}

export interface MediaRow {
  entry_id: number;
  media_type: string;
  file_path: string;
  thumbnail_path: string | null;
  duration_sec: number | null;
  transcript: string | null;
}

export interface RouteSegmentRow {
  sequence: number;
  start_ts: string;
  end_ts: string;
  coordinates_json: string;
  distance_m: number;
  duration_sec: number;
  average_speed_mps: number;
}

export interface RouteStopRow {
  start_ts: string;
  end_ts: string;
  latitude: number;
  longitude: number;
  display_name: string | null;
}

export function listDays(db: Database.Database, limit: number): DaySummary[] {
  return db
    .prepare(
      `SELECT d.date AS date,
              d.started_at AS startedAt,
              d.ended_at AS endedAt,
              (SELECT COUNT(*) FROM entries e WHERE e.day_id = d.id) AS entryCount
         FROM days d
        ORDER BY d.date DESC
        LIMIT ?`,
    )
    .all(limit) as DaySummary[];
}

/** Dates are stored as `YYYY-MM-DD` text, so string comparison is date order. */
export function listDaysInRange(
  db: Database.Database,
  from: string,
  to: string,
): DaySummary[] {
  return db
    .prepare(
      `SELECT d.date AS date,
              d.started_at AS startedAt,
              d.ended_at AS endedAt,
              (SELECT COUNT(*) FROM entries e WHERE e.day_id = d.id) AS entryCount
         FROM days d
        WHERE d.date >= ? AND d.date <= ?
        ORDER BY d.date DESC`,
    )
    .all(from, to) as DaySummary[];
}

export function getDay(db: Database.Database, date: string): Day | null {
  const row = db.prepare('SELECT * FROM days WHERE date = ?').get(date);
  return (row as Day | undefined) ?? null;
}

export function getEntries(db: Database.Database, dayId: number): Entry[] {
  return db
    .prepare('SELECT * FROM entries WHERE day_id = ? ORDER BY COALESCE(time_from, created_at)')
    .all(dayId) as Entry[];
}

export function getEntryMedia(db: Database.Database, dayId: number): MediaRow[] {
  return db
    .prepare(
      `SELECT m.entry_id, m.media_type, m.file_path, m.thumbnail_path,
              m.duration_sec, m.transcript
         FROM entry_media m
         JOIN entries e ON e.id = m.entry_id
        WHERE e.day_id = ?
        ORDER BY m.entry_id, m.position`,
    )
    .all(dayId) as MediaRow[];
}

export function getRouteSegments(db: Database.Database, dayId: number): RouteSegmentRow[] {
  return db
    .prepare(
      `SELECT sequence, start_ts, end_ts, coordinates_json,
              distance_m, duration_sec, average_speed_mps
         FROM day_route_segments WHERE day_id = ? ORDER BY sequence`,
    )
    .all(dayId) as RouteSegmentRow[];
}

export function getRouteStops(db: Database.Database, dayId: number): RouteStopRow[] {
  return db
    .prepare(
      `SELECT start_ts, end_ts, latitude, longitude, display_name
         FROM day_route_stops WHERE day_id = ? ORDER BY start_ts`,
    )
    .all(dayId) as RouteStopRow[];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS, 25 tests total

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/queries.ts server/test/queries.test.ts
git commit -m "feat(server): add read-only query layer over the phone schema"
```

---

## Task 8: Web pages

**Files:**
- Create: `server/src/render.ts`, `server/src/routes/web.ts`
- Modify: `server/src/index.ts`
- Test: `server/test/web.test.ts`

**Interfaces:**
- Consumes: everything from Task 7; `computeDayHours` from `../../src/utils/hoursUtils.ts`
- Produces: `export function webRoutes(opts: {dataDir: string}): Hono;`

**The shared hours API** (already verified against `src/utils/hoursUtils.ts`):

```ts
export function calcDayWorkSecs(day: Day, entries: Entry[]): number;
export function formatHours(seconds: number): string; // 8h, 8h 30m, 0h
```

Use these. Do not reimplement the calculation — the whole reason the server lives in this repo is that this file is shared.

- [ ] **Step 1: Write the failing test**

`server/test/web.test.ts`:

```ts
import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {webRoutes} from '../src/routes/web.ts';

let dataDir: string;
let app: ReturnType<typeof webRoutes>;

function seed(): void {
  const db = new Database(join(dataDir, 'current.db'));
  db.exec(`
    CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO schema_version VALUES (21);
    CREATE TABLE days (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE,
      started_at TEXT, ended_at TEXT, notes TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      entry_type TEXT NOT NULL, activity_type TEXT NOT NULL DEFAULT 'work',
      title TEXT, body TEXT, project_id INTEGER, file_path TEXT,
      thumbnail_path TEXT, duration_sec INTEGER, time_from TEXT, time_to TEXT,
      latitude REAL, longitude REAL, location_label TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE entry_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL,
      media_type TEXT NOT NULL, file_path TEXT NOT NULL, thumbnail_path TEXT,
      duration_sec INTEGER, position INTEGER NOT NULL DEFAULT 0,
      transcript TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE day_route_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL, sequence INTEGER,
      start_ts TEXT, end_ts TEXT, origin_stop_id INTEGER, destination_stop_id INTEGER,
      coordinates_json TEXT, distance_m REAL, duration_sec REAL,
      average_speed_mps REAL, maximum_speed_mps REAL, raw_last_ts TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE day_route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL,
      start_ts TEXT, end_ts TEXT, latitude REAL, longitude REAL,
      saved_location_id INTEGER, named_place_id INTEGER, google_place_id TEXT,
      display_name TEXT, name_source TEXT, user_edited INTEGER,
      created_at TEXT, updated_at TEXT
    );
    INSERT INTO days (id, date, started_at, ended_at)
      VALUES (1, '2026-07-25', '2026-07-25T08:00:00.000Z', '2026-07-25T16:00:00.000Z');
    INSERT INTO entries (day_id, entry_type, activity_type, title, time_from, time_to, created_at)
      VALUES (1, 'note', 'work', '<script>alert(1)</script>',
              '2026-07-25T08:00:00.000Z', '2026-07-25T12:00:00.000Z', '2026-07-25T08:00:00.000Z');
    INSERT INTO entry_media (entry_id, media_type, file_path, position)
      VALUES (1, 'photo', '/data/user/0/app/files/kelomit/media/shot.jpg', 0);
  `);
  db.close();
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'kelomit-web-'));
  app = webRoutes({dataDir});
});

afterEach(() => {
  rmSync(dataDir, {recursive: true, force: true});
});

test('renders an empty state before the first sync', async () => {
  const res = await app.fetch(new Request('http://localhost/'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /no data/i);
});

test('day list shows synced days', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/'));
  assert.match(await res.text(), /2026-07-25/);
});

test('day page escapes entry titles', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/day/2026-07-25'));
  const html = await res.text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('day page links media by basename', async () => {
  seed();
  const html = await app.fetch(new Request('http://localhost/day/2026-07-25')).then(r => r.text());
  assert.match(html, /\/media\/shot\.jpg/);
  assert.ok(!html.includes('/data/user/0/app/files'));
});

test('unknown day returns 404', async () => {
  seed();
  const res = await app.fetch(new Request('http://localhost/day/1999-01-01'));
  assert.equal(res.status, 404);
});

test('summary totals hours over a range', async () => {
  seed();
  const html = await app
    .fetch(new Request('http://localhost/summary?from=2026-07-01&to=2026-07-31'))
    .then(r => r.text());
  assert.match(html, /8h/);
  assert.match(html, /2026-07-25/);
});

test('summary excludes days outside the range', async () => {
  seed();
  const html = await app
    .fetch(new Request('http://localhost/summary?from=2026-08-01&to=2026-08-31'))
    .then(r => r.text());
  assert.ok(!html.includes('2026-07-25'));
  assert.match(html, /0h/);
});

test('day page hours match hoursUtils for the same day', async () => {
  seed();
  const html = await app.fetch(new Request('http://localhost/day/2026-07-25')).then(r => r.text());
  // The day's legs run 08:00–16:00, so the baseline is 8 h. The work entry
  // (08:00–12:00) falls inside the legs and therefore adds nothing — this is
  // the "work day is the minimum" model in docs/hours-model.md. Asserting 8h
  // rather than the entry's 4h is what proves calcDayWorkSecs is really being
  // called instead of a naive entry sum.
  assert.match(html, /8h/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/routes/web.ts`

- [ ] **Step 3: Write render.ts**

```ts
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Everything rendered comes from the phone, but escape anyway — a note body is
 *  free text and this is the only barrier. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Kelomit</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 46rem;
         padding: 1.5rem 1rem; line-height: 1.5; }
  a { color: inherit; }
  h1 { font-size: 1.5rem; }
  .day { display: flex; justify-content: space-between; padding: 0.75rem 0;
         border-bottom: 1px solid rgba(128,128,128,0.3); text-decoration: none; }
  .entry { padding: 0.75rem 0; border-bottom: 1px solid rgba(128,128,128,0.3); }
  .meta { font-size: 0.85rem; opacity: 0.7; }
  img { max-width: 100%; height: auto; border-radius: 0.5rem; }
  audio { width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** Media paths in the DB are absolute Android paths; the server stores files by
 *  basename. */
export function mediaUrl(filePath: string): string {
  return `/media/${esc(filePath.split('/').pop() ?? '')}`;
}
```

- [ ] **Step 4: Write web.ts**

Open `src/utils/hoursUtils.ts` first and import its real export. The skeleton:

```ts
import {Hono} from 'hono';
import {serveStatic} from '@hono/node-server/serve-static';
import {join} from 'node:path';
import {openCurrent} from '../db.ts';
import {
  listDays,
  listDaysInRange,
  getDay,
  getEntries,
  getEntryMedia,
  getRouteSegments,
  getRouteStops,
} from '../queries.ts';
import {esc, layout, mediaUrl} from '../render.ts';
import {calcDayWorkSecs, formatHours} from '../../../src/utils/hoursUtils.ts';

export function webRoutes(opts: {dataDir: string}): Hono {
  const app = new Hono();

  app.use('/media/*', serveStatic({root: join(opts.dataDir, 'media'), rewriteRequestPath: p => p.replace(/^\/media/, '')}));

  app.get('/', c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(layout('Kelomit', '<h1>Kelomit</h1><p>No data synced yet.</p>'));
    }
    const days = listDays(db, 60);
    const rows = days
      .map(
        d =>
          `<a class="day" href="/day/${esc(d.date)}">` +
          `<span>${esc(d.date)}</span>` +
          `<span class="meta">${d.entryCount} entries</span></a>`,
      )
      .join('');
    return c.html(layout('Days', `<h1>Days</h1>${rows}`));
  });

  app.get('/day/:date', c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(layout('Kelomit', '<h1>Kelomit</h1><p>No data synced yet.</p>'));
    }
    const day = getDay(db, c.req.param('date'));
    if (!day) {
      return c.html(layout('Not found', '<h1>Not found</h1>'), 404);
    }

    const entries = getEntries(db, day.id);
    const media = getEntryMedia(db, day.id);
    // The app's own hours model — never reimplement here.
    const hours = formatHours(calcDayWorkSecs(day, entries));

    const entryHtml = entries
      .map(e => {
        const own = media.filter(m => m.entry_id === e.id);
        const files = own
          .map(m =>
            m.media_type === 'voice'
              ? `<audio controls src="${mediaUrl(m.file_path)}"></audio>` +
                (m.transcript ? `<p class="meta">${esc(m.transcript)}</p>` : '')
              : `<img src="${mediaUrl(m.file_path)}" alt="">`,
          )
          .join('');
        return (
          `<div class="entry">` +
          `<strong>${esc(e.title ?? e.entry_type)}</strong>` +
          `<div class="meta">${esc(e.activity_type)} · ${esc(e.time_from ?? '')}–${esc(e.time_to ?? '')}</div>` +
          (e.body ? `<p>${esc(e.body)}</p>` : '') +
          files +
          `</div>`
        );
      })
      .join('');

    const stops = getRouteStops(db, day.id);
    const segments = getRouteSegments(db, day.id);
    const routeHtml = segments.length
      ? `<h2>Route</h2><p class="meta">${segments.length} trips, ${stops.length} stops</p>` +
        stops.map(s => `<div class="meta">${esc(s.display_name ?? '—')}</div>`).join('')
      : '';

    return c.html(
      layout(
        day.date,
        `<p><a href="/">← days</a></p><h1>${esc(day.date)}</h1>` +
          `<p class="meta">${esc(hours)} worked</p>${entryHtml}${routeHtml}`,
      ),
    );
  });

  app.get('/summary', c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(layout('Kelomit', '<h1>Kelomit</h1><p>No data synced yet.</p>'));
    }
    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? '';
    const days = listDaysInRange(db, from, to);

    let total = 0;
    const rows = days
      .flatMap(d => {
        const day = getDay(db, d.date);
        if (!day) {
          return [];
        }
        const secs = calcDayWorkSecs(day, getEntries(db, day.id));
        total += secs;
        return [
          `<a class="day" href="/day/${esc(d.date)}">` +
            `<span>${esc(d.date)}</span>` +
            `<span class="meta">${esc(formatHours(secs))}</span></a>`,
        ];
      })
      .join('');

    return c.html(
      layout(
        'Summary',
        `<p><a href="/">← days</a></p><h1>Summary</h1>` +
          `<form method="get">` +
          `<input type="date" name="from" value="${esc(from)}">` +
          `<input type="date" name="to" value="${esc(to)}">` +
          `<button type="submit">Show</button></form>` +
          `<p><strong>${esc(formatHours(total))}</strong> total</p>${rows}`,
      ),
    );
  });

  return app;
}
```

Native `<input type="date">` — no date-picker library, no client JS.

Add the link to the day-list page so the summary is reachable: in the `/` handler, prepend `<p><a href="/summary">Summary →</a></p>` to the rows.

Replace the `hours` line with a real call to the `hoursUtils` export. The test asserting `4 h` is what proves you wired it up rather than leaving the zero.

- [ ] **Step 5: Mount the web routes**

In `server/src/index.ts`, add:

```ts
import {webRoutes} from './routes/web.ts';
```

and after the existing `app.route('/', apiRoutes(...))` line:

```ts
app.route('/', webRoutes({dataDir}));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: PASS, 33 tests total

- [ ] **Step 7: Commit**

```bash
git add server/src/render.ts server/src/routes/web.ts server/src/index.ts server/test/web.test.ts
git commit -m "feat(server): add read-only web view"
```

---

## Task 9: Docker and deployment

**Files:**
- Create: `server/Dockerfile`, `server/compose.yaml`, `server/README.md`

**No tests** — this task's deliverable is verified by the smoke test in Task 10.

- [ ] **Step 1: Write the Dockerfile**

Build context is the **repo root**, so the app's shared utils are available:

```dockerfile
FROM node:22-alpine
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
COPY server/package*.json ./
RUN npm ci
COPY server ./
COPY src/utils ../src/utils
COPY src/types ../src/types
ENV KELOMIT_DATA_DIR=/data PORT=8090
EXPOSE 8090
CMD ["npx", "tsx", "src/index.ts"]
```

**No compile step.** Task 6 had to add `allowImportingTsExtensions` to `tsconfig.json`
(the server's relative imports carry `.ts` extensions, which `node:test` via `tsx`
needs), and that flag is incompatible with `tsc` emit — `npm run build` now fails
with TS5096. Rather than reshaping every import to satisfy a build we do not need,
run the TypeScript directly with `tsx`, which is how the tests already run. One
runtime, one code path, no `dist/` layout to guess at.

`npm ci` therefore installs devDependencies too, since `tsx` is one. That is the
price of dropping the build step, and it is a few MB in a container that is already
carrying a compiler toolchain for `better-sqlite3`.

Keep `tsc --noEmit -p tsconfig.json` as the type gate — it still works and still
runs in CI/local verification. Delete the now-broken `build` script from
`server/package.json`, and point `start` at `tsx src/index.ts`.

- [ ] **Step 2: Write compose.yaml**

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: server/Dockerfile
    container_name: kelomit_web
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      - ./data:/data
    environment:
      KELOMIT_SYNC_TOKEN: ${KELOMIT_SYNC_TOKEN:?set KELOMIT_SYNC_TOKEN in .env}
```

- [ ] **Step 3: Write server/README.md**

```markdown
# Kelomit server

Read-only web view over the database the phone pushes up. See
`docs/superpowers/specs/2026-07-26-remote-sync-web-view-design.md`.

## Deploy (Playground-1)

The repo is checked out at `/home/tommi/kelomit/`.

    cd /home/tommi/kelomit
    printf 'KELOMIT_SYNC_TOKEN=%s\n' "$(openssl rand -hex 32)" > server/.env
    docker compose -f server/compose.yaml up -d --build

Then append to `/home/tommi/picofi/Caddyfile`:

    kelmi.pico.fi {
        tls {
            dns cloudflare {env.CLOUDFLARE_API_TOKEN}
        }
        @api path /api/*
        handle @api {
            reverse_proxy 172.17.0.1:8090
        }
        handle {
            basic_auth {
                tommi <bcrypt-hash-from-caddy-hash-password>
            }
            reverse_proxy 172.17.0.1:8090
        }
    }

Generate the hash with:

    docker exec picofi-caddy-1 caddy hash-password --plaintext '<password>'

Reload Caddy:

    docker exec picofi-caddy-1 caddy reload --config /etc/caddy/Caddyfile

The `@api` matcher matters: the app authenticates with a bearer token, so
`/api/*` must not be behind basic auth or every sync gets a 401.

Put the value of `KELOMIT_SYNC_TOKEN` into the app's Settings → Data → Remote sync.
```

- [ ] **Step 4: Verify the build locally**

Run: `docker build -f server/Dockerfile -t kelomit-server-test .` (from the repo root)
Expected: build succeeds. If the `CMD` path is wrong, `docker run --rm -e KELOMIT_SYNC_TOKEN=x kelomit-server-test` fails with a module-not-found — fix the path and rebuild.

- [ ] **Step 5: Commit**

```bash
git add server/Dockerfile server/compose.yaml server/README.md
git commit -m "feat(server): add docker build and deploy instructions"
```

---

## Task 10: End-to-end verification

**Files:** none — this is a manual verification task with a written result.

- [ ] **Step 1: Deploy to Playground-1**

```bash
ssh tommi@100.96.193.8
```

Clone or pull the repo to `/home/tommi/kelomit/`, then follow `server/README.md`.

- [ ] **Step 2: Verify the server is up**

```bash
curl -s http://localhost:8090/healthz
```

Expected: `ok`

- [ ] **Step 3: Verify auth from outside**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kelmi.pico.fi/api/media/manifest
```

Expected: `401` — reachable through Cloudflare and Caddy, and rejecting an unauthenticated call rather than serving a basic-auth challenge.

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://kelmi.pico.fi/api/media/manifest
```

Expected: `{"files":[]}`

- [ ] **Step 4: First sync from the device**

In the app: Settings → Data → Remote sync. Enter `https://kelmi.pico.fi` and the token, tap **Sync now** while on wifi (the first run uploads ~63 MB of media).

Expected: "Sync complete", and the status line shows a timestamp with no error.

**If `VACUUM INTO` fails on device**, that is the one thing in this plan that cannot be proven by Jest — the mock does not execute SQL. The error text lands in `sync_last_error` and is visible in Settings. op-sqlite ships SQLite well past 3.27, so it should work; if it does not, fall back to `backupService`'s copy approach with tracking left running and note the change here.

- [ ] **Step 5: Verify the web view**

Open `https://kelmi.pico.fi` in a browser. Expect a basic-auth prompt, then the day list. Open a recent day and confirm: entries appear, worked hours match the app's own figure for that day, photos load, voice notes play.

- [ ] **Step 6: Verify the second sync is incremental**

Tap **Sync now** again. It should finish in a second or two — the manifest reports every file as present, so only the 1 MB database moves.

- [ ] **Step 7: Verify snapshots**

```bash
ls /home/tommi/kelomit/data/snapshots/
```

Expected: one file per sync, newest ≤30 retained.

- [ ] **Step 8: Record the result**

Append a short "Device verification" section to the spec noting the date, what passed, and anything that needed changing.

```bash
git add docs/superpowers/specs/2026-07-26-remote-sync-web-view-design.md
git commit -m "docs: record remote sync device verification"
```

---

## Notes for the implementer

- `/docs` is gitignored in this repo, so the spec and this plan are not tracked. Do not `git add -f` them; that is deliberate. The Step 8 commit above will be a no-op — skip it and just edit the file.
- The app-side tasks (1–3) and the server-side tasks (4–9) are independent and can run in either order. Task 10 needs both.
- Do not add `@react-native-community/netinfo` or any other native dependency. If a task seems to need one, stop and ask.
