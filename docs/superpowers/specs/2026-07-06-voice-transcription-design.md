# Voice-note transcription — design

**Date:** 2026-07-06
**Status:** approved (brainstorming), pre-plan
**Scope of THIS spec:** Phase 1 — **Whisper API** provider only. Phases 2–3 (on-device, custom endpoint) sketched for interface stability, not built here.

> **Re-sequenced 2026-07-06:** originally on-device-first. Discovery: `whisper.rn` needs 16 kHz mono **WAV**, our recorder only emits `.m4a` on Android, and the standard transcoder (`ffmpeg-kit`) was retired in 2025 with no clean replacement — making on-device the *hardest* path. The **Whisper API accepts `.m4a` as-is** and a test key already exists, making it the easiest. The provider seam is engine-agnostic, so the entire transcript UX is built once here and reused when on-device lands.

## Problem

Voice notes exist but are underused: recording is fast, *listening back* is slow and annoying. Speech-to-text turns a clip into editable text so the note is skimmable and searchable. Target user: the author (severe ADHD + mild ASD) — **low-friction is a hard constraint**. Single-user for now; built as if multi-user (security baked in — the API key is a real secret, so keychain arrives here).

## Phased roadmap

Three provider tiers behind one `transcribe()` seam:

1. **Whisper API** (this spec) — OpenAI `/v1/audio/transcriptions`, uploads the `.m4a` directly, key in keychain. Trivial, no native code, proves the whole transcript UX. Key already minted for testing (`.kuiskaus.env`, gitignored, low spend cap).
2. **On-device** (later) — `whisper.rn` (whisper.cpp), no network, the privacy-first engine. Requires solving 16 kHz mono WAV capture. **Recording plan (from Tommi):** capture raw PCM via Android `AudioRecord` → wrap as 16 kHz mono WAV for Whisper, then `MediaCodec`-encode a second compact `.m4a` for storage/playback (dual-file). This is why it's deferred — it reworks a daily-used feature.
3. **Custom endpoint** (later) — arbitrary REST service + dot-notation `response_path` selector (`extractByPath`); talks to self-hosted Whisper (Hetzner box) or any provider.

Each later phase is its own spec → plan → implementation cycle. This document does not design their internals beyond the shared interface.

## Existing code this touches

- `src/components/media/VoiceRecorder.tsx` — records `.m4a` (AAC/mp4). **Unchanged in Phase 1** (the API accepts `.m4a`).
- `src/screens/EntryDetailScreen.tsx` — plays a saved voice clip (`renderMedia`, voice branch, line ~261, `AudioPlayer` + the real `EntryMedia` row with `id`). **This is where transcription lives** — a post-save action. Loads entry via `getEntry` into `entry` state and refreshes after mutations (existing pattern).
- `src/db/entries.ts` — `entry_media` I/O (`rowToMedia`, `addEntryMedia`); `updateEntry` exists at line ~299. **Adds** `updateEntryMedia(mediaId, {transcript})`.
- `src/db/migrations.ts` — versioned blocks, current **v13**. `entry_media` table (v11).
- `src/types.ts` — `EntryMedia` interface gains `transcript`.
- `src/store/settingsStore.ts` + `src/screens/SettingsScreen.tsx` + `src/screens/settings/*` — a new **Transcription** settings sub-screen (key entry). Sub-screen keys are listed in `SettingsScreen` `SECTIONS`.
- `src/i18n/locales/{en,fi}.ts` — nested key objects; both locales get the new strings.
- `.kuiskaus.env` — Tommi's copy of the test key (gitignored). Pasted into the in-app key field at runtime; **not read by the app** (RN can't read it on-device).

**No legacy data:** zero voice notes exist today.

## New dependency (Phase 1)

- `react-native-keychain` — secure storage for the API key. Native, but no rebuild-format concerns; still triggers the uninstall→reinstall sideload cycle on first install. New-Arch compatible (v9+); device-verify.

No `whisper.rn`, no model download, no `extractByPath` in Phase 1.

## Architecture — the seam

```
src/services/transcription/
  index.ts        // transcribe(audioUri) → Promise<string>
                  //   switches on active provider; Phase 1 hardwired to whisperApi
  whisperApi.ts   // read key from keychain → POST multipart .m4a to OpenAI → text
  keychain.ts     // thin get/set/clear wrapper over react-native-keychain
```

The rest of the app calls only `transcribe(audioUri)` and gets text back. `onDevice.ts`, `customEndpoint.ts`, the provider picker, and `extractByPath` are **Phase 2–3** behind this exact signature. No provider *setting* in Phase 1: one engine.

### whisperApi.ts contract

- Endpoint constant: `https://api.openai.com/v1/audio/transcriptions`, model `whisper-1` (cheapest, auto-detects Finnish/English; both a `ponytail:` constant so a swap to `gpt-4o-mini-transcribe` or a self-host is one line).
- `multipart/form-data`: `file` = the `.m4a` (via `react-native-fs` / RN fetch `FormData` with `{uri, name, type:'audio/m4a'}`), `model`, `response_format=json`. Response `{ text }` → return `text.trim()`.
- No `language` param → server auto-detects (per-clip Finnish/English).
- Throws typed errors: `no-key`, `auth` (401), `rate/quota` (429), `network`, `other` — surfaced to the UI as friendly messages.

## Data model (schema v14)

```sql
ALTER TABLE entry_media ADD COLUMN transcript TEXT;
```

Nullable; belongs to the voice clip, not the note. `rowToMedia` + `EntryMedia` type include it. New `updateEntryMedia(mediaId, patch: {transcript?: string}) → Promise<void>`.

## API key config

- A **Transcription** settings sub-screen: a secure text field for the OpenAI API key, saved to keychain via `keychain.ts` on submit; shows "key set / not set" state and a Clear action. No key echoed back.
- `whisperApi.transcribe` reads the key at call time; missing key → `no-key` error routes the user to this screen.

## Transcription flow

**Where:** `EntryDetailScreen`, under the `AudioPlayer` in the voice branch of `renderMedia`. Post-save (the clip has a persisted `entry_media.id` there). Editors are untouched.

1. **No transcript yet** → a **Transcribe** button.
2. Tap:
   - No API key → alert routing to the Transcription settings screen (don't fail silently).
   - Key set → spinner; `transcribe(m.file_path)` uploads the `.m4a`, awaits text.
3. Result saved via `updateEntryMedia(m.id, {transcript})`; entry refreshed via `getEntry`; shown inline in an **editable** field; edits persist to `entry_media.transcript` on blur.
4. **"Use as note text"** appends the transcript to the note `body` (via `updateEntry`) and refreshes — no navigation. Auto-fills if `body` empty, else appends on a new line.
5. **Re-transcribe** re-runs and overwrites, preserving current editable text until the new result lands.

## Error handling (never lazy here)

- **Audio is never lost / never mutated.** Any transcription failure shows an alert and leaves the clip + recording intact; the transcript field stays unchanged.
- `no-key` → route to settings, not an error dump.
- `auth`/`rate`/`quota`/`network` → distinct friendly messages (the low spend cap means `quota` is a realistic, expected case worth its own message).
- Key is only ever in keychain + request headers — never logged, never in the DB, never in state longer than the call.

## Testing

- **Unit (Jest):**
  - `whisperApi` error mapping: mock `fetch` → 401/429/network/200 → assert `auth`/`rate`/`network`/text-return. This is the branchy logic.
  - "use as note text" body-merge: empty body → transcript; non-empty → `body + "\n" + transcript`. Pure function, unit-tested.
- **Device (owed, only Tommi):** uninstall→reinstall (keychain native dep), enter key, transcribe a Finnish clip and an English clip (confirm quality), and exercise: no-key path, wrong-key (401), airplane-mode (network), and "use as note text". Mark DONE only after device-confirm.

## Deferred (explicitly out of scope for Phase 1)

- **On-device** (`whisper.rn`) + the WAV/PCM recording rework (AudioRecord PCM → WAV for Whisper + MediaCodec → `.m4a` dual-file), model download/manager, `base` model.
- **Custom endpoint** + `extractByPath` + provider picker + per-provider audio-format config.
- Model/provider selection UI (one provider in Phase 1).

## Decisions locked

- **Whisper API first**; on-device second; custom endpoint third.
- OpenAI `whisper-1`, no explicit language (server auto-detect).
- API key in `react-native-keychain`, entered on a Transcription settings screen.
- Transcript stored per-clip (`entry_media.transcript`, schema v14), edited inline in `EntryDetailScreen`, opt-in "use as note text".
- Explicit **Transcribe** button on the playback screen (no auto, no background).
- Recording stays `.m4a` (unchanged).
