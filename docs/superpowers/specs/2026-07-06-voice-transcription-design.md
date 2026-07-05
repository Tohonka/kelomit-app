# Voice-note transcription — design

**Date:** 2026-07-06
**Status:** approved (brainstorming), pre-plan
**Scope of THIS spec:** Phase 1 — on-device transcription only. Phases 2–3 sketched for interface stability, not built here.

## Problem

Voice notes exist in the app but are underused: recording is fast, *listening back* is slow and annoying. Speech-to-text turns a clip into editable text so the note is skimmable and searchable. Target user: the author (severe ADHD + mild ASD) — **low-friction is a hard constraint**. Single-user for now; built as if multi-user (security baked in when a secret first appears, not before).

## Phased roadmap (sequencing decided)

Three provider tiers, built in order of safety, all behind one `transcribe()` seam:

1. **On-device** (this spec) — `whisper.rn` (whisper.cpp). No network, no key, safest, and the choice a privacy-conscious user would make. Heaviest lift (native dep + model), so done first while it's the only concern.
2. **Whisper API** (later) — OpenAI endpoint, key in keychain. Key already minted for testing (`.kuiskaus.env`, gitignored, low spend cap).
3. **Custom endpoint** (later) — arbitrary REST service + dot-notation `response_path` selector; superset that talks to self-hosted Whisper (e.g. the Hetzner box) or any provider.

Each later phase is its own spec → plan → implementation cycle. This document does not design their internals beyond the shared interface.

## Existing code this touches

- `src/components/media/VoiceRecorder.tsx` — records `.m4a` (AAC/mp4; natively Whisper-compatible, **no audio conversion needed**). Has an `idle → recording → done` state machine; the `done` state shows Play/Discard.
- `src/components/media/AttachmentsSection.tsx` — renders `VoiceRecorder`; a voice clip is one *attachment* on a note (`onAdd({media_type:'voice', file_path, ...})`). A note may also carry a title, body text, and other media.
- `src/db/migrations.ts` — versioned migration blocks; current schema **v13**. `entry_media` table (v11) holds `id, entry_id, media_type, file_path, thumbnail_path, duration_sec, position`.
- `src/db/entries.ts` — reads/writes `entry_media`; the field list around line 314 must learn the new column.
- `src/screens/SettingsScreen.tsx` + `src/screens/settings/*` — pattern for a new "Transcription" settings section.
- `react-native-fs` (existing dep) — used for the model download + storage.

**New dependency (Phase 1):** `whisper.rn` (native — triggers the rebuild + uninstall→reinstall sideload path). The download/storage side adds no new dep (reuses `react-native-fs`).

**No legacy data:** zero voice notes exist today, so no backfill/migration of old clips.

## Architecture — the seam

```
src/services/transcription/
  index.ts        // transcribe(audioUri, opts?) → Promise<string>
                  //   switches on the active provider; Phase 1 hardwired to onDevice
  onDevice.ts     // whisper.rn: lazy-load context, transcribe file, cache context,
                  //   release on teardown
  modelManager.ts // model lifecycle: state, download (progress+retry), delete
```

The rest of the app calls only `transcribe(audioUri)` and gets text back — it never learns which engine ran. `whisperApi.ts`, `customEndpoint.ts`, the provider picker, keychain, and the `extractByPath` dot-notation util are **Phase 2–3** and slot in behind this exact signature. No provider *setting* exists in Phase 1: one engine, nothing to choose.

## Data model (schema v14)

```sql
ALTER TABLE entry_media ADD COLUMN transcript TEXT;
```

- Nullable; belongs to the voice clip, not the note. Survives multiple clips per note and keeps the audio↔text link (good for search + the future web UI).
- `entries.ts` read/insert/update paths include `transcript`.

## Model delivery

- `modelManager` downloads `ggml-base.bin` (~140 MB, multilingual) from the **Hugging Face public URL** into app document storage via `react-native-fs`, once, on first use. Progress + retry.
- Model URL is a single constant with a `ponytail:` note — swapping to a Hetzner-hosted copy is a one-line change.
- Model states: `missing → downloading(pct) → ready | error`. Derivable as a pure function from `{fileExists, downloadInFlight, lastError}` — this is the unit-tested piece.
- A **Transcription** settings section surfaces state: *Not downloaded → [Download] → Ready (size on disk) → [Delete]*.

## Transcription flow

1. In the clip's `done` state, add a **Transcribe** button beside Play/Discard.
2. Tap:
   - Model `missing` → route to the download prompt (don't silently start a 140 MB download).
   - Model `ready` → spinner; `onDevice.transcribe(filePath)` runs whisper.rn with **auto language detection** (Finnish/English mixed, per-clip).
3. Result saved to `entry_media.transcript` and shown inline in an **editable** text field under that clip.
4. A **"Use as note text"** action copies the transcript into the note body — auto-fills if the body is empty, otherwise appends.
5. Re-tapping Transcribe re-runs and overwrites (with the current editable text preserved until success).

## Error handling (never lazy here)

- **Audio is never lost.** A transcription failure shows an alert and leaves the clip + recording fully intact. The transcript field simply stays empty/unchanged.
- Download failure → retryable; model stays `missing`, never a half-written file (download to temp, move on complete).
- No network at download time → explicit, non-scary message.
- whisper.rn context init failure (e.g. corrupt model) → offer Delete + re-download.

## Testing

- **Unit (Jest):** model-state derivation `{fileExists, downloadInFlight, lastError} → 'missing'|'downloading'|'ready'|'error'`. Pure, cheap, catches the only branchy logic in Phase 1.
- **Device (owed, only Tommi):** whisper.rn is native →
  - rebuild + uninstall→reinstall (native dep added; sideload gotcha),
  - download model over wifi, transcribe a Finnish clip and an English clip, confirm text quality is usable at `base`,
  - failure paths: airplane-mode during download, transcribe with model deleted.
  - Mark DONE only after device-confirm.

## Deferred (explicitly out of scope for Phase 1)

- `react-native-keychain` — no secret exists on-device; arrives with Phase 2's first API key.
- `whisperApi.ts`, `customEndpoint.ts`, `extractByPath`, provider picker, per-provider audio-format / Content-Type config.
- `small` model, manual language pin, model-swap UI — `base` + auto-detect + a constant URL cover Phase 1.

## Decisions locked

- On-device first; Whisper API second; custom endpoint third.
- `base` multilingual model, auto-detect language.
- Model downloaded on first use (not bundled), from Hugging Face.
- Transcript stored per-clip (`entry_media.transcript`), edited inline, opt-in copy to note body.
- Explicit **Transcribe** button (no auto-on-stop, no background-after-save).
