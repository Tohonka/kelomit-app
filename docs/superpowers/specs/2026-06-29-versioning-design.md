# Semi-automatic versioning (design)

**Date:** 2026-06-29
**Status:** approved (Tommi, 2026-06-29)

## Goal

Replace three hardcoded, out-of-sync version numbers with one source of truth and a
one-command bump. Learning-oriented: adopt standard SemVer + git tagging practice.

## Problem (current state)

Version is hardcoded in three places that disagree:
- `package.json` → `0.0.1`
- `android/app/build.gradle` → `versionName "0.3.83"`, `versionCode 3`
- `src/screens/SettingsScreen.tsx:87` → literal `0.3.82`

No git tags exist.

## Design

### Single source of truth
`package.json` `version`. Everything else is derived from it.

### Bumping (one command)
`npm version patch|minor|major` — npm updates `package.json`, then creates a git commit
and an **annotated tag** (`v0.4.0`). Built-in; no extra tooling for the tag.

### Sync glue: `scripts/sync-version.js`
A Node script wired to npm's `version` lifecycle hook (in `package.json` `scripts`:
`"version": "node scripts/sync-version.js && git add android/app/build.gradle src/version.ts"`).
The `version` hook runs **after** `package.json` is bumped and **before** npm's commit,
so the script's edits land in the same version commit + tag. The script:
1. Reads the new version from `package.json`.
2. Rewrites `android/app/build.gradle` `versionName "<x.y.z>"` to match.
3. Increments `versionCode` by 1 (Android requires a monotonically increasing integer).
4. Writes `src/version.ts` → `export const APP_VERSION = '<x.y.z>';`

`git add` of the touched files is appended to the `version` script so they are included
in the version commit/tag.

### In-app display
`SettingsScreen.tsx` imports `APP_VERSION` from `src/version.ts` and renders it in place
of the hardcoded `0.3.82`. Pure JS — updates on Metro reload, no native dependency.

`react-native-device-info` (which would read the actual installed APK's versionName) is
intentionally **not** used: it is a native dependency requiring a rebuild + sideload, and
build-truthfulness is not needed for a single-user sideloaded app. Documented as the
upgrade path if that ever changes.

### One-time reconciliation
Set `package.json` version to the real current value (`0.3.83`, matching gradle), run the
sync script once so all three sources agree, and create the baseline tag `v0.3.83`. (Done
manually as part of setup, not via `npm version`, to avoid an unwanted extra bump.)

## Testing

`sync-version.js`'s gradle rewrite is a pure string transform → one small self-check:
given a sample gradle snippet and a target version, assert the output has the new
`versionName` and `versionCode + 1`. The npm/git plumbing and the `version.ts` write are
not worth testing.

## Out of scope
- `react-native-device-info` / build-truthful version (upgrade path only).
- CI/automated release pipeline — single-dev, manual bump is the point.
- Play Store publishing rules beyond the monotonic `versionCode` bump.
