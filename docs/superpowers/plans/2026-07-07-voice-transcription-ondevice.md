# Voice Transcription Phase 2 — On-device (whisper.rn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline, private on-device transcription engine (`whisper.rn`) behind the existing `transcribe()` seam, user-selectable in Settings (default on-device), recording voice as 16 kHz mono WAV so no transcode is ever needed.

**Architecture:** The Phase-1 `transcribe(audioUri) → Promise<string>` seam grows a second provider. `index.ts` dispatches on a `transcription_provider` setting. Voice recording moves from `react-native-audio-recorder-player` (m4a) to `react-native-nitro-audio-record` (16 kHz mono WAV); playback stays on the old lib. A `modelManager` downloads the `ggml-base.bin` Whisper model on first use.

**Tech Stack:** React Native 0.86 (New Arch), TypeScript, `whisper.rn` (new), `react-native-nitro-audio-record` (new), `react-native-fs`, `react-native-audio-recorder-player` (playback only now), `react-i18next`, Jest (pure-logic only).

## Global Constraints

- Tests are pure-logic Jest files in root `__tests__/*.test.ts`. NO DB/component/native test harness — native, DB, and screens are verified by `npm run check` (tsc) + on-device. Do not invent test infra.
- `npm run check` = `eslint . --max-warnings=0 && tsc --noEmit && jest --runInBand`. Must stay green.
- Every new user-facing string gets a key in BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts`, identical key sets.
- **No schema change.** `transcription_provider` is a `settings` table key via `getSetting`/`setSetting`. Schema stays v14.
- The API key stays keychain-only (Phase 1 invariant). On-device paths never log audio paths in a way that could leak.
- **Audio is never lost/mutated on any transcription failure** (Phase 1 invariant).
- Two new NATIVE deps (`whisper.rn`, `react-native-nitro-audio-record`) → rebuild + uninstall→reinstall; implementers cannot device-verify — that is owed to Tommi.
- Model: `ggml-base.bin` multilingual, auto language detect. Model URL is a `ponytail:` constant.
- Follow existing patterns: settings screens use `makeSettingsStyles`; error handling mirrors `whisperApi.ts` `TranscriptionError`.

---

### Task 1: API provider sends correct mime for WAV (TDD)

Voice files become `.wav`; the Phase-1 OpenAI path hardcoded `audio/m4a`. Infer name+type from the path extension so both work.

**Files:**
- Modify: `src/services/transcription/whisperApi.ts`
- Test: `__tests__/whisperApi.test.ts` (extend)

**Interfaces:**
- Produces: `filePartFor(path: string): {name: string; type: string}` (exported for test).

- [ ] **Step 1: Write the failing test** — append to `__tests__/whisperApi.test.ts`:

```ts
import {filePartFor} from '../src/services/transcription/whisperApi';

describe('filePartFor', () => {
  it('maps .wav → audio/wav', () => {
    expect(filePartFor('/x/voice_1.wav')).toEqual({name: 'clip.wav', type: 'audio/wav'});
  });
  it('maps .m4a → audio/m4a', () => {
    expect(filePartFor('/x/voice_1.m4a')).toEqual({name: 'clip.m4a', type: 'audio/m4a'});
  });
  it('falls back to m4a for unknown/extensionless', () => {
    expect(filePartFor('/x/voice_1')).toEqual({name: 'clip.m4a', type: 'audio/m4a'});
  });
  it('is case-insensitive', () => {
    expect(filePartFor('/x/V.WAV')).toEqual({name: 'clip.wav', type: 'audio/wav'});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/whisperApi.test.ts -t filePartFor`
Expected: FAIL — `filePartFor` is not a function.

- [ ] **Step 3: Implement** — in `src/services/transcription/whisperApi.ts`, add above `transcribe` and use it. Add:

```ts
/** Multipart file part (name + mime) for the upload, from the path extension.
 *  Voice notes are .wav (Phase 2); legacy notes may be .m4a. */
export function filePartFor(path: string): {name: string; type: string} {
  if (/\.wav$/i.test(path)) { return {name: 'clip.wav', type: 'audio/wav'}; }
  return {name: 'clip.m4a', type: 'audio/m4a'};
}
```

Then replace the file append in `transcribe`:

```ts
  const uri = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;
  const part = filePartFor(audioUri);
  const form = new FormData();
  form.append('file', {uri, name: part.name, type: part.type} as unknown as Blob);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run check`
Expected: green (existing whisperApi tests + 4 new `filePartFor` tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/transcription/whisperApi.ts __tests__/whisperApi.test.ts
git commit -m "feat(transcription): infer upload mime from file extension (wav/m4a)"
```

---

### Task 2: Record voice as 16 kHz mono WAV (SPIKE — native)

Swap voice recording to `react-native-nitro-audio-record`. **This is the spike** — the exact API MUST be read from the installed package types; the code below is the intended shape.

**Files:**
- Modify: `package.json` (dep)
- Modify: `src/utils/mediaUtils.ts` (voice ext → wav)
- Modify: `src/components/media/VoiceRecorder.tsx` (rewrite recording)

**Interfaces:**
- Produces: unchanged `VoiceRecorder` props (`onRecord(filePath, durationSec)`), now yielding a `.wav` path.

- [ ] **Step 1: Install**

Run: `npm install react-native-nitro-audio-record`
Expected: added to dependencies.

- [ ] **Step 2: Read the real API**

Inspect `node_modules/react-native-nitro-audio-record/` — its `lib/typescript/*.d.ts` or `src/*.ts` — for the exact exported name and method signatures (`init`/`configure`, `start`, `stop`, `on('data')`/`onData`). The intended config is `{sampleRate: 16000, channels: 1, bitsPerSample: 16, wavFile: '<name>.wav'}`, `start()`, then `stop()` returning the saved WAV path. **If the method names differ from Step 4's code, adjust Step 4 to match the installed types and note it in your report.**

- [ ] **Step 3: Voice extension → wav** — in `src/utils/mediaUtils.ts`, no signature change; callers pass `'wav'`. (No edit needed here if `makeMediaPath` already takes `ext`; it does.)

- [ ] **Step 4: Rewrite recording in `src/components/media/VoiceRecorder.tsx`**

Replace the `react-native-audio-recorder-player` recording usage (imports, `startRecording`, `stopRecording`, and the recording-time cleanup) with the nitro recorder. Keep the component's states/UI and the `filePath`-based playback in the `done` state (playback still uses `audioRecorderPlayer`). Intended code:

```tsx
import NitroAudioRecord from 'react-native-nitro-audio-record';
import RNFS from 'react-native-fs';
import audioRecorderPlayer from 'react-native-audio-recorder-player';
import type {PlayBackType} from 'react-native-audio-recorder-player';
// ...existing imports (makeMediaPath, ensureMediaDir, etc.)

// inside the component:
  const recordPathRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    const ok = await ensureMicrophonePermission();
    if (!ok) { return; }
    try {
      await ensureMediaDir();
      const path = makeMediaPath('voice', 'wav');
      recordPathRef.current = path;
      // The nitro recorder writes a wav under the document dir; we move it to
      // `path` on stop. wavFile is just the base filename.
      NitroAudioRecord.init({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        wavFile: 'kelomit_rec.wav',
      });
      NitroAudioRecord.start();
      elapsedRef.current = 0;
      setElapsed(0);
      tickRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
      setState('recording');
    } catch (e) {
      Alert.alert(t('media.recordingError'), String(e));
    }
  };

  const stopRecording = async () => {
    try {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      const producedPath = await NitroAudioRecord.stop(); // saved wav path
      const dest = recordPathRef.current!;
      // Move the recorder's output into our media dir (consistent storage).
      const src = producedPath.replace('file://', '');
      if (src !== dest) {
        if (await RNFS.exists(dest)) { await RNFS.unlink(dest); }
        await RNFS.moveFile(src, dest);
      }
      setState('done');
      onRecord(dest, elapsedRef.current);
    } catch (e) {
      Alert.alert(t('media.stopRecordingError'), String(e));
    }
  };
```

Also update the unmount cleanup effect to `NitroAudioRecord.stop().catch(() => {})` for the recorder (keep `audioRecorderPlayer.stopPlayer()` for playback), and clear `tickRef` on unmount.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If the package ships no types, add a `declare module 'react-native-nitro-audio-record';` ambient in `src/types/` and use the documented shape.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/media/VoiceRecorder.tsx src/utils/mediaUtils.ts
git commit -m "feat(voice): record 16kHz mono WAV via react-native-nitro-audio-record"
```

> **DEVICE GATE (Tommi):** rebuild + uninstall→reinstall, record a note, confirm it plays back and the file is a real WAV. If the recorder lib misbehaves, fall back to `react-native-audio-record` (same 16k/1/16 WAV config) before continuing.

---

### Task 3: Model manager (download / state / delete)

**Files:**
- Create: `src/services/transcription/modelManager.ts`
- Test: `__tests__/modelManager.test.ts`

**Interfaces:**
- Produces: `MODEL_PATH: string`; `getModelState(): Promise<'missing' | 'ready'>`; `downloadModel(onProgress: (pct: number) => void): Promise<void>`; `deleteModel(): Promise<void>`; and pure `progressPct(bytesWritten: number, contentLength: number): number`.

- [ ] **Step 1: Write the failing test** — `__tests__/modelManager.test.ts`:

```ts
import {progressPct} from '../src/services/transcription/modelManager';

describe('progressPct', () => {
  it('is 0 when nothing written', () => expect(progressPct(0, 100)).toBe(0));
  it('rounds to a percent', () => expect(progressPct(50, 200)).toBe(25));
  it('caps at 100', () => expect(progressPct(300, 200)).toBe(100));
  it('is 0 when total is unknown (0)', () => expect(progressPct(10, 0)).toBe(0));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/modelManager.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** — `src/services/transcription/modelManager.ts`:

```ts
import RNFS from 'react-native-fs';

// ponytail: HF public ggml base model. Swap to a self-hosted (Hetzner) URL here.
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/models`;
export const MODEL_PATH = `${MODEL_DIR}/ggml-base.bin`;

/** Pure: download progress as a 0–100 integer. */
export function progressPct(bytesWritten: number, contentLength: number): number {
  if (contentLength <= 0) { return 0; }
  return Math.min(100, Math.round((bytesWritten / contentLength) * 100));
}

export async function getModelState(): Promise<'missing' | 'ready'> {
  return (await RNFS.exists(MODEL_PATH)) ? 'ready' : 'missing';
}

/** Download to a temp file, move into place on success (never a half file). */
export async function downloadModel(onProgress: (pct: number) => void): Promise<void> {
  if (!(await RNFS.exists(MODEL_DIR))) { await RNFS.mkdir(MODEL_DIR); }
  const tmp = `${MODEL_PATH}.download`;
  if (await RNFS.exists(tmp)) { await RNFS.unlink(tmp); }
  const {promise} = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: tmp,
    progressInterval: 500,
    progress: r => onProgress(progressPct(r.bytesWritten, r.contentLength)),
  });
  const res = await promise;
  if (res.statusCode !== 200) {
    await RNFS.unlink(tmp).catch(() => {});
    throw new Error(`Model download failed (HTTP ${res.statusCode})`);
  }
  await RNFS.moveFile(tmp, MODEL_PATH);
}

export async function deleteModel(): Promise<void> {
  if (await RNFS.exists(MODEL_PATH)) { await RNFS.unlink(MODEL_PATH); }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run check`
Expected: green (4 new `progressPct` tests; the RNFS-using code is covered by the existing `__mocks__/react-native-fs.ts`, extended in Step 5 if needed).

- [ ] **Step 5: Extend the RNFS mock if needed** — ensure `__mocks__/react-native-fs.ts` has `downloadFile`, `moveFile`, `mkdir`, `exists`, `unlink`. Add any missing as `jest.fn()` returning resolved promises (e.g. `downloadFile: jest.fn(() => ({promise: Promise.resolve({statusCode: 200})}))`). Re-run `npm run check`.

- [ ] **Step 6: Commit**

```bash
git add src/services/transcription/modelManager.ts __tests__/modelManager.test.ts __mocks__/react-native-fs.ts
git commit -m "feat(transcription): whisper model download/state/delete manager"
```

---

### Task 4: On-device provider (whisper.rn)

**Files:**
- Modify: `package.json` (dep)
- Create: `src/services/transcription/onDevice.ts`

**Interfaces:**
- Consumes: `MODEL_PATH`, `getModelState` (Task 3); `TranscriptionError` (Phase 1).
- Produces: `transcribe(audioUri: string): Promise<string>`.

- [ ] **Step 1: Install**

Run: `npm install whisper.rn`
Expected: added to dependencies. (Android Proguard rule + NDK are handled at build; not this task.)

- [ ] **Step 2: Implement** — `src/services/transcription/onDevice.ts`:

```ts
import {initWhisper} from 'whisper.rn';
import {MODEL_PATH, getModelState} from './modelManager';
import {TranscriptionError} from './whisperApi';

/** Transcribe a 16 kHz mono WAV entirely on-device. Loads the model, runs,
 *  then releases the context (frees ~140 MB). ponytail: cache the context if
 *  repeated transcribes feel slow. */
export async function transcribe(audioUri: string): Promise<string> {
  if ((await getModelState()) !== 'ready') {
    throw new TranscriptionError('model-missing', 'Whisper model not downloaded');
  }
  const filePath = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;
  let ctx: Awaited<ReturnType<typeof initWhisper>> | null = null;
  try {
    ctx = await initWhisper({filePath: MODEL_PATH});
    const {promise} = ctx.transcribe(filePath, {});
    const {result} = await promise;
    return (result ?? '').trim();
  } catch (e) {
    if (e instanceof TranscriptionError) { throw e; }
    throw new TranscriptionError('other', String(e));
  } finally {
    if (ctx) { await ctx.release().catch(() => {}); }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `whisper.rn` result field differs, adjust `result` access to the installed types — read `node_modules/whisper.rn` d.ts.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/services/transcription/onDevice.ts
git commit -m "feat(transcription): on-device whisper.rn provider"
```

---

### Task 5: Seam dispatch on provider setting + model-missing error kind (TDD)

**Files:**
- Modify: `src/services/transcription/whisperApi.ts` (add `'model-missing'` to the kind union)
- Modify: `src/services/transcription/index.ts` (dispatch)
- Create: `src/services/transcription/selectProvider.ts` (pure)
- Test: `__tests__/selectProvider.test.ts`

**Interfaces:**
- Consumes: `getSetting` (`src/db/settings.ts`); `transcribe` from `whisperApi` and `onDevice`.
- Produces: `selectProvider(setting: string | null): 'ondevice' | 'api'`; `transcribe(audioUri)` dispatching.

- [ ] **Step 1: Add the error kind** — in `whisperApi.ts`, extend the union:

```ts
export type TranscriptionErrorKind =
  | 'no-key'
  | 'no-file'
  | 'model-missing'
  | 'auth'
  | 'rate'
  | 'network'
  | 'other';
```

- [ ] **Step 2: Write the failing test** — `__tests__/selectProvider.test.ts`:

```ts
import {selectProvider} from '../src/services/transcription/selectProvider';

describe('selectProvider', () => {
  it('defaults to ondevice when unset', () => {
    expect(selectProvider(null)).toBe('ondevice');
    expect(selectProvider('')).toBe('ondevice');
  });
  it('returns api when set to api', () => expect(selectProvider('api')).toBe('api'));
  it('returns ondevice when set to ondevice', () => expect(selectProvider('ondevice')).toBe('ondevice'));
  it('falls back to ondevice for garbage', () => expect(selectProvider('nope')).toBe('ondevice'));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest __tests__/selectProvider.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement the pure selector** — `src/services/transcription/selectProvider.ts`:

```ts
export type Provider = 'ondevice' | 'api';

/** Map the stored `transcription_provider` setting to a provider; default
 *  on-device for null/empty/unknown. */
export function selectProvider(setting: string | null): Provider {
  return setting === 'api' ? 'api' : 'ondevice';
}
```

- [ ] **Step 5: Wire the seam** — replace `src/services/transcription/index.ts`:

```ts
// Transcription seam. Dispatches to the on-device (whisper.rn) or OpenAI-API
// provider based on the `transcription_provider` setting (default on-device).
import {getSetting} from '../../db/settings';
import {transcribe as apiTranscribe} from './whisperApi';
import {transcribe as onDeviceTranscribe} from './onDevice';
import {selectProvider} from './selectProvider';

export {TranscriptionError} from './whisperApi';
export type {TranscriptionErrorKind} from './whisperApi';
export {selectProvider} from './selectProvider';

export async function transcribe(audioUri: string): Promise<string> {
  const provider = selectProvider(await getSetting('transcription_provider'));
  return provider === 'api' ? apiTranscribe(audioUri) : onDeviceTranscribe(audioUri);
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm run check`
Expected: green (4 new `selectProvider` tests; existing green).

- [ ] **Step 7: Commit**

```bash
git add src/services/transcription/whisperApi.ts src/services/transcription/index.ts src/services/transcription/selectProvider.ts __tests__/selectProvider.test.ts
git commit -m "feat(transcription): seam dispatches on provider setting + model-missing kind"
```

---

### Task 6: Settings — engine picker + model management

**Files:**
- Modify: `src/screens/settings/TranscriptionSettings.tsx`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/fi.ts`

**Interfaces:**
- Consumes: `getSetting`/`setSetting`; `getModelState`/`downloadModel`/`deleteModel` (Task 3); `selectProvider` (Task 5).

- [ ] **Step 1: Add i18n keys (both locales)** — in the `transcription` block of `en.ts`:

```ts
    engineTitle: 'Transcription engine',
    engineOnDevice: 'On-device (Whisper)',
    engineApi: 'OpenAI API',
    modelTitle: 'On-device model',
    modelNotDownloaded: 'Not downloaded (~140 MB)',
    modelReady: 'Ready',
    modelDownloading: 'Downloading… {{pct}}%',
    download: 'Download',
    delete: 'Delete',
    downloadFailed: 'Download failed. Check your connection and retry.',
```

and the Finnish equivalents in `fi.ts`:

```ts
    engineTitle: 'Litterointimoottori',
    engineOnDevice: 'Laitteella (Whisper)',
    engineApi: 'OpenAI API',
    modelTitle: 'Laitteen malli',
    modelNotDownloaded: 'Ei ladattu (~140 MB)',
    modelReady: 'Valmis',
    modelDownloading: 'Ladataan… {{pct}} %',
    download: 'Lataa',
    delete: 'Poista',
    downloadFailed: 'Lataus epäonnistui. Tarkista yhteys ja yritä uudelleen.',
```

- [ ] **Step 2: Add engine picker + model block** — in `TranscriptionSettings.tsx`, add imports:

```tsx
import {getSetting, setSetting} from '../../db/settings';
import {selectProvider, type Provider} from '../../services/transcription/selectProvider';
import {getModelState, downloadModel, deleteModel} from '../../services/transcription/modelManager';
```

Add state + effects in the component:

```tsx
  const [provider, setProvider] = useState<Provider>('ondevice');
  const [modelState, setModelState] = useState<'missing' | 'ready'>('missing');
  const [dlPct, setDlPct] = useState<number | null>(null);

  useEffect(() => {
    getSetting('transcription_provider').then(v => setProvider(selectProvider(v)));
    getModelState().then(setModelState);
  }, []);

  const pickProvider = async (p: Provider) => {
    setProvider(p);
    await setSetting('transcription_provider', p);
  };

  const runDownload = async () => {
    setDlPct(0);
    try {
      await downloadModel(setDlPct);
      setModelState('ready');
    } catch {
      Alert.alert(t('transcription.downloadFailed'));
    } finally {
      setDlPct(null);
    }
  };

  const runDelete = async () => {
    await deleteModel();
    setModelState('missing');
  };
```

Render two blocks ABOVE the existing API-key block (reuse `local`/`styles`; add a small segmented control using `TouchableOpacity`s). Engine picker writes the setting; the model block renders only when `provider === 'ondevice'`:

```tsx
      <Text style={styles.sectionHeader}>{t('transcription.engineTitle')}</Text>
      <View style={local.block}>
        <View style={{flexDirection: 'row', gap: spacing.sm}}>
          {(['ondevice', 'api'] as Provider[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[local.btn, provider !== p && local.btnClear]}
              onPress={() => pickProvider(p)}>
              <Text style={[local.btnText, provider !== p && local.btnClearText]}>
                {p === 'ondevice' ? t('transcription.engineOnDevice') : t('transcription.engineApi')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {provider === 'ondevice' && (
        <>
          <Text style={styles.sectionHeader}>{t('transcription.modelTitle')}</Text>
          <View style={local.block}>
            <Text style={local.status}>
              {dlPct != null
                ? t('transcription.modelDownloading', {pct: dlPct})
                : modelState === 'ready'
                ? t('transcription.modelReady')
                : t('transcription.modelNotDownloaded')}
            </Text>
            <View style={local.actions}>
              {modelState === 'missing' && dlPct == null && (
                <TouchableOpacity style={local.btn} onPress={runDownload}>
                  <Text style={local.btnText}>{t('transcription.download')}</Text>
                </TouchableOpacity>
              )}
              {modelState === 'ready' && (
                <TouchableOpacity style={[local.btn, local.btnClear]} onPress={runDelete}>
                  <Text style={[local.btnText, local.btnClearText]}>{t('transcription.delete')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </>
      )}
```

(Import `spacing` from `../../theme` if not already imported.)

- [ ] **Step 3: Verify build**

Run: `npm run check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/screens/settings/TranscriptionSettings.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts
git commit -m "feat(transcription): settings engine picker + on-device model manager"
```

---

### Task 7: Handle model-missing in the transcript UI

**Files:**
- Modify: `src/components/media/VoiceTranscript.tsx`

**Interfaces:**
- Consumes: `TranscriptionError` (`.kind === 'model-missing'`); `onNeedKey`-style routing to `TranscriptionSettings`.

- [ ] **Step 1: Route model-missing to settings** — in `VoiceTranscript.tsx` `runTranscribe`'s catch, add a branch alongside the `no-key` one (both route to the Transcription settings screen; reuse `onNeedKey`):

```tsx
      if (e instanceof TranscriptionError && (e.kind === 'no-key' || e.kind === 'model-missing')) {
        const msg = e.kind === 'no-key'
          ? t('transcription.errNoKey')
          : t('transcription.errModelMissing');
        Alert.alert(msg, undefined, [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('transcription.goToSettings'), onPress: onNeedKey},
        ]);
      } else {
        const kind = e instanceof TranscriptionError ? e.kind : 'other';
        Alert.alert(messageForError(kind));
      }
```

- [ ] **Step 2: Add i18n key (both locales)** — `en.ts`: `errModelMissing: 'The on-device model isn't downloaded. Open settings to download it.',` and `fi.ts`: `errModelMissing: 'Laitteen mallia ei ole ladattu. Avaa asetukset ladataksesi sen.',`

- [ ] **Step 3: Verify build**

Run: `npm run check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/media/VoiceTranscript.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts
git commit -m "feat(transcription): route model-missing to settings download"
```

---

## Device verification (owed — only Tommi, after the branch builds)

Two new native deps → **rebuild + uninstall→reinstall**.

1. **After Task 2 (recorder spike):** record a voice note → it plays back; confirm the file is a real WAV. If broken, fall back to `react-native-audio-record`.
2. Settings → Transcription → engine = On-device → **Download** the model (~140 MB, wifi) → Ready.
3. Record → **Transcribe** on-device: a Finnish clip and an English clip; confirm quality at `base`.
4. **Airplane mode** → on-device transcribe still works (proves offline).
5. Switch engine to **OpenAI API** → transcribe (WAV upload) works; switch back.
6. **Delete** model → Transcribe on-device → prompts to download (no crash, audio intact).
7. Confirm audio never lost on any failure.

Mark Phase 2 DONE only after this passes.

---

## Self-Review (against the spec)

**Spec coverage:**
- Provider setting + seam dispatch, default on-device → Task 5. ✓
- Record 16 kHz mono WAV via nitro lib, playback unchanged → Task 2. ✓
- API path sends wav → Task 1. ✓
- on-device whisper.rn provider, lazy init + release → Task 4. ✓
- model manager (download/state/delete, HF base) → Task 3. ✓
- settings engine picker + model block → Task 6. ✓
- model-missing routes to download → Task 4 (throw) + Task 7 (UI). ✓
- audio never lost, no schema change, both locales → Tasks 2/6/7 + constraints. ✓
- Deferred (dual-file, wifi-gate, Phase 3) → no task, correct. ✓

**Placeholder scan:** none — every step has concrete code/commands. Task 2's recorder code is explicitly flagged to reconcile with installed types (the spike), not a placeholder.

**Type consistency:** `transcribe(audioUri: string): Promise<string>` across `whisperApi`/`onDevice`/`index`; `TranscriptionError.kind` incl. `'model-missing'` (Task 5) consumed in Task 7; `selectProvider`/`Provider` (Task 5) consumed in Task 6; `MODEL_PATH`/`getModelState`/`downloadModel`/`deleteModel`/`progressPct` (Task 3) consumed in Tasks 4 + 6; `filePartFor` (Task 1). Consistent.
