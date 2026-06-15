# Kelomit App Audit

Date: 2026-06-11

Scope: second-opinion review of the React Native app, Android configuration, local database/data model, stores, screens, media/GPS services, tests, planning docs, and dependency posture. I did not fix anything.

## Executive Summary

This is a solid personal-app MVP foundation. The core choices are reasonable for a modern Android-first React Native app: current React Native, TypeScript, bare workflow, SQLite, Zustand, React Navigation, Hermes, new architecture enabled, target SDK 36, and a simple local-first model. The code is small enough to reason about and the folder structure is mostly clean.

The bigger concerns are not "this is bad code"; they are "this has grown from MVP into something that now needs a few architectural decisions made explicit." The main risks are:

- Some core workflows have confirmed bugs, especially voice duration saving, discard behavior, time picking for historical days, and swipe navigation.
- The dependency stack includes two upstream-deprecated packages: `react-native-audio-recorder-player` and the monolithic `react-native-vector-icons`.
- Tooling health is incomplete: TypeScript passes, but tests fail and lint cannot run because no ESLint config exists.
- The data model is good for MVP but not ready for sync yet. It needs stable IDs, tombstones, change metadata, media identity, and conflict semantics before the app accumulates too much personal history.
- Android privacy/build defaults should be tightened before trusting it with long-term journal, media, and GPS data.

My overall read: keep the app, keep the general stack, but do a stabilization pass before adding big features. The app is not over-engineered, but it is starting to rely on implicit behavior in places where your future self will want explicit rules.

## Checks Run

- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: failed. Only `formatHours` expectations fail.
- `npm run lint -- --max-warnings=0`: failed because ESLint has no configuration file.
- `npm audit`: failed with 10 moderate vulnerabilities through React Native CLI transitive dependencies.
- `npm outdated --long`: React Native itself is current in this install, but tooling and a few libraries have newer patch/major versions.
- `npm view ... deprecated`: confirmed deprecation messages for audio recorder and vector icons.
- `cd android && ./gradlew :app:assembleDebug --dry-run`: failed in this shell because Android SDK location is not configured via `ANDROID_HOME` or `android/local.properties`. Gradle also reported deprecated Gradle features incompatible with Gradle 10.

## What Looks Good

The broad structure is sane:

- `src/db`, `src/store`, `src/screens`, `src/components`, `src/services`, `src/utils`, `src/theme`, and `src/navigation` are understandable boundaries.
- Database access is centralized and foreign keys/WAL are enabled in `src/db/database.ts`.
- Navigation types are present and used.
- The dark-mode pattern is mostly followed with `useTheme()` plus memoized `makeStyles(colors)`.
- The app is local-first, which is the right default for a personal ADHD/ASD support tool.
- The planning docs are valuable. They explain intent, which is very useful for later decisions.
- TypeScript passes, which is a big baseline win.
- The UI direction is appropriate: low-friction forms, day-first model, quick access to adding entries, local media, and calendar summaries.

## Highest Priority Findings

### 1. Voice recordings do not reliably save their duration

Evidence:

- `VoiceRecorder` calls `onRecord(result, elapsed)` after stopping: `src/components/media/VoiceRecorder.tsx:118-124`.
- `AddEntryModal` receives the duration and only calls `setDurationMinutes(...)`: `src/screens/AddEntryModal.tsx:395-399`.
- Save only persists `duration_sec` when `timeMode === 'duration'`: `src/screens/AddEntryModal.tsx:269-272`.
- Recording a voice note does not set `timeMode` to `duration`.

Impact: a voice note can have an audio file but no duration in the DB unless the user manually chooses Duration. That weakens hour calculations and audio playback progress.

Recommendation: when recording finishes, set `timeMode` to `duration` or store voice duration independently from the manual time tracking mode.

### 2. Voice "Discard" resets the child UI but not the saved parent file path

Evidence:

- `discard()` in `VoiceRecorder` only changes local child state: `src/components/media/VoiceRecorder.tsx:146-151`.
- The actual file path lives in `AddEntryModal` state: `src/screens/AddEntryModal.tsx:210`.

Impact: the UI can say the recording is discarded while `AddEntryModal` still has `filePath`, so saving can persist the discarded recording.

Recommendation: add an `onDiscard` callback that clears `filePath`, clears duration, and optionally deletes the temporary media file.

### 3. TimePicker uses today's date, even when editing another day

Evidence:

- `TimePicker` creates `const date = value ? new Date(value) : new Date()`: `src/components/ui/TimePicker.tsx:34`.
- On change it returns `selected.toISOString()`: `src/components/ui/TimePicker.tsx:53-55`.
- `DaySummaryCard` uses this picker for day start/end times: `src/components/day/DaySummaryCard.tsx`.
- `AddEntryModal` uses this picker for entry from/to times.

Impact: when editing a historical day, picking `09:00` can save an ISO datetime for the current calendar date instead of the day being edited. Duration math may appear correct if both endpoints are picked together, but the stored facts are wrong. This will hurt exports, sync, future browser editing, and any "what happened on this day" reconstruction.

Recommendation: make time picking date-aware. Pass the target day date into `TimePicker`, preserve the day component, and only replace hours/minutes. Consider storing local wall-clock time plus date separately or using a single local datetime helper.

### 4. Swipe navigation likely closes over stale state

Evidence:

- `DayScreen` creates `PanResponder` once via `useRef(...)`, uses `currentDate`, and suppresses exhaustive deps: `src/screens/DayScreen.tsx:79-89`.
- `CalendarScreen` does the same with `viewMode`, `goForward`, and `goBack`: `src/screens/CalendarScreen.tsx:197-208`.

Impact: this matches the user note in `kelomit_iteration2.md` that swipes behave inconsistently and do not proceed in order. The responder can keep using values from the render where it was created.

Recommendation: either recreate the responder with `useMemo` and correct dependencies, or keep mutable refs for `currentDate`/`viewMode` and read from those in the responder.

### 5. Hour semantics have drifted from the original plan

Evidence:

- Original plan says work hours are entry-based and day start/end gives total day length.
- Current code says day start/end is source of truth if set: `src/utils/hoursUtils.ts:49-55`.
- Calendar SQL mirrors that same rule in `getWorkSecondsByDay`.

Impact: if a day has `started_at`/`ended_at`, `personal_work` no longer reduces work totals. A lunch break or personal errand entered as `personal_work` is shown in the breakdown, but the header/calendar total can still count the full day range. That may be exactly what you want now, but it conflicts with the original documented model.

Recommendation: make the rule explicit. Possible models:

- "Manual day range is total payable/work span; personal_work is informational only."
- "Manual day range minus personal_work equals work total."
- "Entries are source of truth; day range is contextual."

Pick one and update docs/tests/UI labels accordingly.

### 6. Tests are failing

Evidence:

- `npm test -- --runInBand` fails in `__tests__/hoursUtils.test.ts`.
- Tests expect `1.0h`, `1.5h`, `0.0h`; implementation returns `1h`, `1h 30m`, `0h`: `src/utils/hoursUtils.ts:58-64` and `__tests__/hoursUtils.test.ts:85-97`.

Impact: either the UI changed and tests were not updated, or the formatter regressed. Either way, the test suite no longer gives a clean signal.

Recommendation: decide which display is preferred and align tests and UI. For calendar cells, decimal hours may be more compact; for detail views, `1h 30m` may be more readable.

### 7. Lint script is present but unusable

Evidence:

- `package.json` has `"lint": "eslint ."`: `package.json:8`.
- Running it fails because there is no `.eslintrc*` or `eslint.config.*`.
- `@react-native/eslint-config` is installed but not wired.

Impact: no automated style/bug linting. This is probably why stale hook-dependency suppressions and `any` casts can slip through.

Recommendation: add the React Native ESLint config and make lint part of the normal check set.

## Android And Dependency Modernity

### Good Android posture

- React Native 0.86.0, React 19.2.3.
- `compileSdkVersion` and `targetSdkVersion` are 36.
- `minSdkVersion` is 26, matching the plan.
- Hermes is enabled.
- New architecture is enabled.
- Runtime permissions are handled through `react-native-permissions`.

### Deprecated packages

Confirmed upstream as of this audit:

- `react-native-audio-recorder-player` is deprecated in favor of `react-native-nitro-sound`.
- `react-native-vector-icons` is deprecated as a monolithic package and has moved toward per-icon-family packages.

Impact:

- Neither requires emergency removal today, but both should be migration items.
- Audio is core to this app, so the audio package matters more.
- Vector icons are low risk but easy to modernize later.

Recommendation:

- Plan migration from `react-native-audio-recorder-player` to `react-native-nitro-sound` when the current recording/playback bugs are fixed.
- Replace `react-native-vector-icons/MaterialCommunityIcons` with the new package-family import path recommended by the project migration guide.

### Android storage permissions

The manifest includes modern granular media permissions and old external storage permissions with max SDK caps:

- `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`: `android/app/src/main/AndroidManifest.xml:9-11`.
- `READ_EXTERNAL_STORAGE` with `maxSdkVersion="32"` and `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"`: `android/app/src/main/AndroidManifest.xml:12-15`.

This is broadly compatible. However, for future Google Play distribution, using Android's system photo picker can reduce or remove the need for broad media-library permissions when selecting existing photos/videos.

### Android backup/privacy

Evidence:

- `android:allowBackup="true"` is set: `android/app/src/main/AndroidManifest.xml:22`.
- App data includes SQLite, media, and GPS traces.

Impact: Android Auto Backup can include app databases and files unless excluded. For a personal journal/time/GPS app, this is a privacy decision. Cloud backup may be useful, but it should be intentional.

Recommendation:

- If privacy is the priority, disable backup or add backup rules excluding DB/media/GPS.
- If recoverability is the priority, keep backup but document it and consider encryption/export/restore.
- Do not leave this as an accidental default.

### Release build is not release-ready

Evidence:

- Release signing uses the debug keystore: `android/app/build.gradle:121-125`.
- Minification/Proguard is disabled: `android/app/build.gradle:63-66` and `android/app/build.gradle:125`.
- Version values disagree: `package.json` says `0.0.1`, Android says `1.0`, Settings screen displays `0.1.0`.

Impact: fine for local sideloading, not fine for a durable personal release process.

Recommendation: create an explicit personal release profile, real signing config outside git, consistent version source, and a repeatable release command.

### Build environment is not self-contained

`./gradlew :app:assembleDebug --dry-run` failed because this shell has no SDK location configured. That may be only my shell environment, but the repo itself has no `android/local.properties` by design. The build also warned about deprecated Gradle features incompatible with Gradle 10.

Recommendation: document required local env (`ANDROID_HOME` or `android/local.properties`) and occasionally run Gradle with `--warning-mode all`.

## Data Model And Sync Readiness

The current schema is a good MVP local schema:

- `days`, `entries`, `projects`, `tags`, `entry_tags`, `gps_track`, `settings`.
- Foreign keys and cascade behavior are reasonable.
- Tags and projects are joined into fetched entries.

But it is not future-sync-ready yet.

### Missing stable object identity

Current IDs are local autoincrement integers. A sync/browser system will need IDs that can be created offline without collision.

Recommendation: add UUID/ULID public IDs before sync work:

- `local_id` can remain the SQLite primary key.
- `id` or `uid` should be a stable globally unique text ID.
- Every media file should also have a stable attachment ID.

### Missing tombstones and change tracking

Deletes currently physically remove rows. That is fine locally, but sync needs to know that something was deleted.

Recommendation: add `deleted_at`, `created_by_device_id`, `updated_by_device_id`, `sync_status`, `last_synced_at`, and possibly a monotonically increasing local change sequence.

### Updated timestamps are weak for conflict resolution

`updated_at = datetime('now')` gives second-level SQLite timestamps. For human use it is fine; for sync conflicts it is weak.

Recommendation: use millisecond timestamps or logical versions for syncable rows.

### Migration runner is fragile

Evidence:

- Migration SQL is split on semicolons: `src/db/database.ts:33-36`.
- Each statement is executed separately and the schema version is written after the migration: `src/db/database.ts:38-45`.
- Migrations are not wrapped in a transaction.
- Migration 3 uses plain `ALTER TABLE ... ADD COLUMN`: `src/db/migrations.ts:95-101`.

Impact:

- A crash midway through a migration can leave a partially migrated DB without a matching version row.
- Semicolon splitting is okay for the current simple SQL, but fragile long-term.
- Re-running a partially failed `ALTER TABLE ADD COLUMN` can fail if the column already exists.

Recommendation: store migrations as arrays of statements, run each migration in a transaction, and make migrations idempotent where possible.

## GPS And Location

The current GPS service is a foreground watch that stops when the app backgrounds:

- `App.tsx` stops tracking when app state becomes inactive/background.
- `gpsService.startTracking` uses `watchPosition`: `src/services/gpsService.ts:40-63`.

This is reasonable for MVP. It does not match the more ambitious plan of passive/background day tracking or future radius-based work/home detection.

Concerns:

- No Android background location permission.
- No foreground service/notification.
- No activity-recognition stillness suppression.
- GPS errors are silently ignored: `src/services/gpsService.ts:54-56`.
- `_intervalMs` is assigned but unused beyond storage: `src/services/gpsService.ts:18` and `src/services/gpsService.ts:48`.

Recommendation:

- Keep current foreground-only behavior if battery/privacy matter most.
- If arrival/departure automation becomes important, design it as a separate background-location feature with explicit user consent, notification strategy, battery budget, and data retention controls.

## Media Handling

### Photo thumbnails are not real thumbnails

`PhotoCapture` copies the original file to both destination and thumbnail paths: `src/components/media/PhotoCapture.tsx:67-74`.

Impact: storage grows faster and thumbnails are not actually optimized.

Recommendation: generate actual smaller thumbnails or skip thumbnail files until needed.

### Video thumbnail is an empty file and detail view has no playback

`VideoCapture` writes an empty thumbnail file: `src/components/media/VideoCapture.tsx:70-77`. `EntryDetailScreen` shows only a "Video file saved" placeholder.

Impact: video capture is not a complete feature yet, despite being present in the UI.

Recommendation: either label video as experimental, or add actual thumbnail generation and playback/opening.

### Gallery copy may be brittle with content URIs

Photo/video saving strips `file://` and calls `RNFS.copyFile(...)`: `src/components/media/PhotoCapture.tsx:71-73`, `src/components/media/VideoCapture.tsx:74-76`.

Impact: Android gallery/library assets may be `content://` URIs, not file paths. Depending on the picker result and Android version, copy can fail.

Recommendation: use asset metadata from `react-native-image-picker` carefully, test gallery selection on Android 13+, and use a URI-aware copy approach if needed.

### Temporary media cleanup is missing

If a user records/captures media and backs out or replaces/discards it, old files can remain in app storage.

Recommendation: add a small media lifecycle:

- temp path while editing
- commit on save
- delete abandoned/replaced media
- optionally run cleanup for unreferenced files

## State, UI, And Architecture

### Zustand is fine here

The one-store-per-domain approach is appropriate for this size. I would not replace it with Redux or a heavier framework.

Potential improvements:

- Add consistent `loaded`, `isLoading`, and `error` shape across all stores.
- Avoid components reaching directly into DB except for detail/edit loading. It is okay now, but the docs say stores are the single source of truth.
- Add store-level refresh hooks after navigation actions.

### Inline entry rendering may eventually hurt performance

`EntryList` supports `FlatList`, but Home/Day pass `inline`, causing simple `.map(...)` rendering inside a `ScrollView`.

Impact: fine for a personal app with small days. If a day gets hundreds of entries/media thumbnails, it will get sluggish.

Recommendation: keep for now, but switch Day/Home to a `FlatList`-based layout if performance becomes noticeable.

### Keyboard handling needs attention

Your note about typing tags/body while the keyboard covers the input is valid. `android:windowSoftInputMode="adjustResize"` is set, but the modal content is a plain `ScrollView`.

Recommendation: use a deliberate keyboard strategy:

- `KeyboardAvoidingView` or a maintained keyboard-controller library.
- Scroll focused fields into view.
- Put save action in a sticky footer above the keyboard.
- Consider a dedicated tag-edit subview/helper modal if tag entry remains frequent.

### Accessibility is underdeveloped

The app uses many `TouchableOpacity` controls, emoji icons, and visual chips. There are few/no explicit accessibility labels, roles, or hints.

Impact: even for personal use, accessibility labels help with larger fonts, TalkBack, and future tired-brain usability.

Recommendation: add accessibility roles/labels to icon buttons, FAB, media controls, date nav buttons, and chips.

## Settings And Feature Drift

Some settings exist in data but are not yet fully used:

- `default_activity_type` is displayed but not editable: `src/screens/SettingsScreen.tsx:218-221`.
- `default_project_id` exists in DB/store but is not used by `AddEntryModal`.
- `gps_interval_ms` exists but there is no interval selector UI.
- Future export needs JSON/XML, but only CSV exists.
- "New project" inside add-entry is not implemented.

This is normal MVP drift, but it is worth separating:

- Current working features.
- Half-built settings.
- Future ideas.

Recommendation: create a short `ROADMAP.md` or update `docs/PROJECT.md` with "implemented", "partial", and "not started" sections. This will reduce cognitive load when returning to the app later.

## Security And Privacy

For a personal-only app, the threat model is different from a public app. I would still make these choices consciously:

- SQLite DB and media are unencrypted at rest.
- Auto Backup is enabled.
- GPS traces are stored locally.
- CSV export writes to cache and opens a share sheet.
- There is no import/restore path yet.

Recommendation:

- At minimum, decide backup policy.
- Consider exporting JSON plus media as a zip for personal backups.
- Consider app-lock/encryption later if the content becomes sensitive enough.
- Add data retention controls for GPS, such as "keep full GPS for 30/90/all days."

## Package/Tooling Notes

### npm audit

Current audit reports 10 moderate vulnerabilities through `@react-native-community/cli` transitive dependencies (`fast-xml-parser`, `joi`). The suggested forced fix is wrong/dangerous because it would install an old CLI major version. Do not blindly run `npm audit fix --force`.

Recommendation: update React Native CLI packages within the RN 0.86-compatible patch line when available, and re-run audit.

### Package manager mismatch

Docs say `yarn`, but the repo has `package-lock.json` and uses npm commands in practice.

Recommendation: pick npm or yarn and document just one.

### ESLint/Prettier versions

ESLint 8 and Prettier 2 are older than current releases. That is not urgent, but once lint is configured, decide whether to stay on RN's expected tooling or modernize in a controlled pass.

## Future-Proofing Recommendations

Suggested order:

1. Stabilize existing flows:
   - Fix time picker date preservation.
   - Fix voice duration/discard.
   - Fix swipe stale closures.
   - Decide hour-total semantics.
   - Make tests green.

2. Make tooling trustworthy:
   - Add ESLint config.
   - Add a `check` script for TypeScript + Jest + lint.
   - Document Android SDK setup.

3. Tighten Android/privacy:
   - Decide `allowBackup`.
   - Make release signing explicit.
   - Align version numbers.
   - Review Gradle warnings.

4. Modernize dependencies:
   - Migrate audio package.
   - Migrate vector icons.
   - Re-run audit/outdated.

5. Prepare sync before implementing sync:
   - Add stable UUID/ULID columns.
   - Add tombstones/change tracking.
   - Add media attachment identity.
   - Add export/import JSON as a local dry-run of the future sync data shape.

6. Then add bigger ADHD/ASD support features:
   - Quick add profiles.
   - Upcoming/to-do entries.
   - Better keyboard/tag entry.
   - Search.
   - Work/home radius automation only after a conscious background-location design.

## Specific Deprecated/Current References Checked

- NPM marks `react-native-audio-recorder-player` deprecated and recommends `react-native-nitro-sound`: https://www.npmjs.com/package/react-native-audio-recorder-player
- NPM marks `react-native-vector-icons` deprecated in favor of per-icon-family packages: https://www.npmjs.com/package/react-native-vector-icons
- Android 13+ granular media permissions replace `READ_EXTERNAL_STORAGE` for other-app media access: https://developer.android.com/about/versions/13/behavior-changes-13#granular-media-permissions
- Android Auto Backup includes app databases/internal files by default and can be disabled or customized: https://developer.android.com/identity/data/autobackup

## Bottom Line

The app is a good MVP and absolutely worth continuing. It is not using an obviously obsolete Android foundation. The risk is more subtle: a few workflow bugs, a couple deprecated native packages, and data-model choices that are fine locally but will become expensive if sync/server/browser editing is added later.

For your personal use, I would not pause everything for a grand rewrite. I would do a focused "make it dependable" pass first, then a "sync-ready schema" pass before adding server features.
