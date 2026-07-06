# Voice-note transcription Phase 2 — on-device (whisper.rn)

**Date:** 2026-07-07
**Status:** approved (brainstorming), pre-plan
**Branch:** `feat/voice-transcription-ondevice`, stacked on Phase 1 (now merged to `main` @ `a501b5b`).
**Builds on:** [2026-07-06-voice-transcription-design.md](2026-07-06-voice-transcription-design.md) (Phase 1, Whisper API). Same `transcribe()` seam, same `entry_media.transcript`, same `EntryDetailScreen` UI.

## Goal

Add a second, offline, private transcription engine — `whisper.rn` (whisper.cpp on-device) — behind the existing `transcribe()` seam, user-selectable, defaulting to on-device. No per-use cost, no audio leaves the device.

## Why the recording changes

`whisper.rn` requires **16 kHz mono 16-bit PCM/WAV** (`transcribe(wavFile)` or `transcribeData(pcm)`). Our recorder (`react-native-audio-recorder-player`) only emits `.m4a` on Android. The retired-`ffmpeg-kit` transcode path is a dead end (see Phase 1 spec). Resolution: **record voice notes as WAV directly** using a maintained New-Arch recorder, so no transcode/decode is ever needed and every engine (on-device + the Phase-1 API) consumes the same file.

## Decisions locked (from brainstorming)

- **Audio path:** swap voice recording to **`react-native-nitro-audio-record`** (New-Arch Nitro/JSI, Android; `init/start/stop`, `stop()` returns the WAV path) at **16 kHz mono 16-bit WAV**. Single file. No custom native code, no MediaCodec, no dual-file.
- **Engine selection:** new setting `transcription_provider: 'ondevice' | 'api'`, **default `'ondevice'`**, chosen on the Transcription settings screen. The seam dispatches on it.
- **Model:** `ggml-base.bin` (~140 MB, multilingual), auto language detect, downloaded on first use from the Hugging Face public URL. `base` + auto per Phase 1.
- **Context lifecycle:** lazy `initWhisper` on first transcribe, **released after each transcribe** (frees ~140 MB RAM). `ponytail:` cache-it note if repeated transcribes feel slow.
- **File size:** WAV ~2 MB/min accepted; m4a compaction/dual-file deferred (YAGNI).

## Existing code this touches

- `src/components/media/VoiceRecorder.tsx` — **rewritten** to record WAV via `react-native-nitro-audio-record`. Elapsed timer becomes a JS interval (the lib streams PCM chunks, not position events). On stop, move the WAV into the existing media dir and hand its path to `onRecord`. (Also inherently keeps the Phase-1 fix: we store the real path, never a status string.)
- `src/components/media/AudioPlayer.tsx` — **unchanged**; `react-native-audio-recorder-player` stays as the *player* and plays WAV via `MediaPlayer.setDataSource`.
- `src/utils/mediaUtils.ts` — `makeMediaPath('voice', 'wav')` (was `'m4a'`).
- `src/services/transcription/index.ts` — seam dispatches on the `transcription_provider` setting (read via `getSetting`, default `'ondevice'`).
- `src/services/transcription/whisperApi.ts` — send the file as `audio/wav` / `clip.wav` (infer mime+name from the path extension so old `.m4a` and new `.wav` both work).
- `src/screens/settings/TranscriptionSettings.tsx` — add an **engine picker** (On-device / OpenAI API) and an **on-device model block** (state + Download / Delete).
- `src/db/settings.ts` — reuse `getSetting`/`setSetting` for `transcription_provider` (no migration; settings are dynamic key/value). **No schema change — stays v14.**
- `src/i18n/locales/{en,fi}.ts` — new `transcription.*` strings, both locales, matching key sets.
- `package.json` — new deps `whisper.rn`, `react-native-nitro-audio-record` (both native → rebuild + uninstall→reinstall).

## Architecture — the seam grows a second provider

```
src/services/transcription/
  index.ts        // transcribe(audioUri): reads transcription_provider,
                  //   dispatches to onDevice | whisperApi
  whisperApi.ts   // Phase 1 (updated: wav mime)
  onDevice.ts     // NEW: whisper.rn — initWhisper(model) → transcribe(wav) → text; release
  modelManager.ts // NEW: download/state/delete of ggml-base.bin
  keychain.ts     // Phase 1 (API key)
```

`transcribe(audioUri): Promise<string>` signature is unchanged — `VoiceTranscript` and the DB are untouched by the engine addition.

### onDevice.ts contract

- `transcribe(wavUri): Promise<string>` — ensure model ready (else throw `model-missing`); `initWhisper({filePath: modelPath})`; `ctx.transcribe(wavUri, {})` (auto language); `await promise` → `result.trim()`; `ctx.release()` in `finally`.
- Throws `TranscriptionError`: `model-missing` (routes to download), `other` (init/transcribe failure). Audio untouched.

### modelManager.ts contract

- Model URL constant (HF `ggml-base.bin`) + on-disk path (`RNFS.DocumentDirectoryPath/kelomit/models/ggml-base.bin`). `ponytail:` swap-to-self-host note.
- `getModelState(): 'missing' | 'ready'` (file exists check); `downloadModel(onProgress): Promise<void>` (RNFS.downloadFile to a temp path, move on complete, retryable); `deleteModel(): Promise<void>`.
- Download state (`downloading`/`error`/percent) is UI-local in the settings screen; disk truth is `getModelState`.

## Provider selection & settings

The Transcription settings screen (Phase 1) grows two blocks above the existing API-key block:
1. **Engine picker** — segmented `On-device` / `OpenAI API`, writes `transcription_provider`.
2. **On-device model** — visible whenever On-device is the selected engine: status *Not downloaded → [Download] (progress) → Ready (size) → [Delete]*.

Transcribing on-device with no model → an Alert offering to download (routes to the model block), not a hard failure.

## Error handling (invariant preserved)

- **Audio is never lost/mutated** on any failure (same as Phase 1).
- New `TranscriptionErrorKind` members: `model-missing`. `VoiceTranscript.messageForError` maps them; `model-missing` shows a download-prompt Alert.
- On-device init/transcribe failures → `other` (friendly retry message). Never leaks paths.

## Testing

- **Unit (Jest):**
  - Provider dispatch: given `transcription_provider`, the seam calls the right provider (inject/mureable — test the selection logic, mock the providers).
  - `modelManager` state derivation from `{fileExists}` (pure part).
  - `whisperApi` mime/name inference from extension (`.wav` → `audio/wav`, `.m4a` → `audio/m4a`) — pure, add to existing test.
  - Existing pure tests stay green.
- **Device (owed, only Tommi):**
  - **Task-1 spike first:** confirm `react-native-nitro-audio-record` records a valid 16 kHz mono WAV on the RN 0.86 build and it plays back — before building the rest.
  - Full: download model (~140 MB) over wifi; on-device transcribe a Finnish + English clip (quality check at `base`); switch engine to API and back; delete model → transcribe prompts to download; airplane mode → on-device still works (proves offline).
  - Rebuild + uninstall→reinstall (two new native deps).

## Deferred (out of scope)

- m4a compaction / dual-file (revisit only if WAV size bites).
- Wifi-gated / metered-network download guard.
- Phase 3 custom endpoint (its own spec).
- `small` model, manual language pin, per-provider model choice.

## Open risk (spike-gated)

`react-native-nitro-audio-record` is New-Arch-native and maintained but newer/less battle-tested, and the swap touches a daily-used feature. **Task 1 is a device spike** to validate WAV capture on the real build; if it fails, fall back to `react-native-audio-record` (older, proven, works under the New-Arch interop layer) before proceeding.
