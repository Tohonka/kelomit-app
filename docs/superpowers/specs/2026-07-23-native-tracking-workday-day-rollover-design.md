# Native Tracking, Workday Detection, and Day Rollover Design

**Date:** 2026-07-23
**Branch:** `feat/work-detection-redesign`
**Status:** Approved in conversation; awaiting review of this written specification

## Goal

Make Android background tracking, movement wake-up, saved-place crossings, and
workday-end confirmation continue to behave correctly when React Native screens
are backgrounded, suspended, recreated, or absent. Also ensure every Today/Home
and quick-add action resolves the actual current local day at the time of use.

## Evidence and Root Causes

The current branch already uses Android's fused location provider, foreground
service, Activity Recognition, and geofencing APIs. The failure is the ownership
boundary, not the absence of native APIs.

- `ActivityTransitionReceiver` calls `LocationService.instance`; when the
  service instance is absent, movement is discarded.
- `GeofenceCrossingReceiver` calls `LocationService.instance`, which then emits
  only to a live React context; a crossing is not persisted first.
- The device log shows Activity Recognition waking parked tracking and JS
  parking it again roughly 40–170 ms later with a stale stationary streak. On
  2026-07-23 this loop repeated for hours.
- The current saved-place "parked" mode makes GPS power state depend on being
  inside a perimeter. Saved perimeters must instead be used only to establish
  enter and exit events.
- Current workday inference waits one hour, silently accepts a Home arrival,
  writes `ended_at` before the user answers, and has no eight-hour unanswered
  fallback.
- `HomeScreen` calculates `todayDate()` during render, but the mounted tab may
  not render again after midnight. Its focus and foreground handlers reload the
  stale date prop.
- `dayStore.loadDay()` returns cached data instead of rereading SQLite, despite
  callers using it as a refresh.
- `QuickAddButton` resolves the cached `today.id`; it only calls `loadToday()`
  when `today` is null. The real backup contains an entry created on July 22 but
  attached to July 21.

All existing Jest tests, TypeScript checks, and Kotlin compilation pass. They do
not cover these lifecycle failures, and some current end-of-day tests encode
the superseded one-hour/Home-auto-accept behavior.

## Product Rules

1. Saved Home, Work, and other perimeters are location-boundary detectors only.
   They do not decide GPS sampling or imply that the phone is stationary.
2. Native movement detection must wake active GPS tracking even while the phone
   is inside any saved perimeter.
3. Tracking must cover slow walking, walking-to-vehicle transitions, cycling,
   driving, and speed changes during an already-active trip.
4. The first accepted Work enter of the local calendar day proposes
   `started_at`, unless the day already has a start.
5. Exiting the final currently-entered Work location creates a pending end using
   that exit timestamp.
6. Entering any Work location before the pending end resolves cancels it,
   removes its notification, and leaves the day open. The next final Work exit
   starts the process again with its newer timestamp.
7. Forty-five minutes after a still-pending Work exit, ask:
   "Did your day end at X?"
8. Yes accepts X. No discards X and leaves `ended_at` empty.
9. If no answer is received within eight hours after the question is shown,
   accept X automatically.
10. A Home enter or exit is recorded but never accepts or cancels a workday end.
11. No automatic end is written to `days.ended_at` until Yes or the eight-hour
    assumption resolves it.
12. Manual `started_at` and `ended_at` values remain authoritative and are never
    overwritten by imported native events.
13. Today is the device's current local calendar date at the moment the user
    presses Home or Quick Add, not the date from the last render or launch.

## Chosen Architecture

Android owns background facts and timing. React Native owns presentation and
the application database.

```text
Android Activity Recognition ─┐
Native fused location fixes ──┼─> LocationService tracking state
                              │
OS geofence candidate ────────┼─> exact-radius crossing confirmation
native fix crossing backstop ─┘            │
                                           v
                               durable native event journal
                                           │
                           native workday pending-exit state
                              │                         │
                         45-minute ask            8-hour fallback
                              │                         │
                              └──────── notification ──┘
                                           │
                                  JS reconciliation
                                           │
                                      app SQLite/UI
```

This reuses the installed Play Services location dependency and Android
platform facilities. It adds no JavaScript or Android library.

## Native Tracking State

### Modes

- `fast`: high-accuracy fused location while movement is active.
- `slow`: high-accuracy fused location at the configured slow interval while
  movement has recently stopped.
- `idle`: no active location request. Activity Recognition remains registered
  and can return tracking to `fast`.

`idle` replaces the saved-place-dependent `parked` concept. Entering `idle`
depends only on stationary evidence, never geofence membership.

### Movement wake

Activity Recognition remains native and uses `PendingIntent` delivery. Moving
activities include walking, running, on-foot, bicycle, and vehicle.

On any moving transition or confident moving sample:

1. Native state enters `fast` immediately.
2. Any active location request is replaced with a high-accuracy fast request.
3. A minimum two-minute movement lease prevents stationary-looking startup
   fixes from immediately returning tracking to `slow` or `idle`.
4. Further moving transitions, samples, or trustworthy moving GPS fixes renew
   the lease.

Immediate wake is intentionally stronger than a custom ten-second accelerometer
gate: any movement lasting over ten seconds is covered, while a false positive
costs only a short fast-sampling lease. The existing device data proves Activity
Recognition is producing wakes; the current defect is the immediate JS re-park.
No custom accelerometer classifier or new sensor dependency is justified.

Periodic low-power Activity Recognition sampling remains a fallback in `slow`
and `idle` for devices that delay or miss a transition. Android controls exact
delivery timing, so it is not treated as an exact ten-second timer.

### Speed changes

Native fused fixes own speed-tier selection:

- normal fast interval: existing 4 seconds;
- sprint/vehicle interval: existing 2 seconds;
- existing 3.5 m/s enter and 2.5 m/s exit hysteresis stays unless device testing
  demonstrates a regression.

Activity Recognition keeps a slow walk active even when GPS speed is below the
existing 1 m/s movement threshold. Once GPS is active, displacement and speed
continue to reject stationary jitter and retune faster movement.

### JS relationship

When background tracking is enabled and the native module is available:

- Android is the only location-request and mode owner.
- JS subscribes to fixes for immediate persistence/UI updates.
- JS cannot call `setMode()` or enter a native parked state.
- The duplicate Android JS `watchPosition()` source is removed.

When background tracking is disabled, the existing foreground-only JS watch
remains the fallback and stops when the app backgrounds.

The service persists enough mode/configuration state to restore itself after a
normal system recreation. Activity subscriptions are removed only when the user
disables tracking, not merely because the service instance is being recreated.

## Saved-Place Monitoring

### Persisted configuration

The native module stores the current saved locations in app-private Android
storage before registering them. Each record includes ID, kind, coordinates,
configured radius, and update generation. Receivers can therefore interpret a
location ID without a React context or `LocationService.instance`.

Location create, edit, and delete operations replace the persisted native set
and re-register monitoring. Registration is idempotent.

### Crossing confirmation

Android OS geofences are wake/candidate signals, not the final configured-radius
truth. The OS may need a reliability radius larger than a user's configured
20–50 metre perimeter.

On an OS geofence candidate:

1. Wake or retune the already-authorized native tracker as Android permits.
2. Confirm membership against the user's configured radius with a fused fix.
3. Use the existing exit hysteresis for noisy boundary fixes.
4. Persist a crossing only when confirmed membership changes.

Native location fixes also run the same membership reducer as a backstop. Both
producers share one persisted inside/outside state, so duplicate consecutive
enter or exit events are ignored until the opposite transition occurs.

Registration-time initial-enter callbacks do not create repeated arrivals.
Membership state survives ordinary process/service recreation. Re-registration
after reboot or app update restores monitoring from the persisted location set.

### Durable crossing delivery

Every accepted crossing is appended to an app-private native journal before an
optional live JS event is emitted. A journal entry contains:

- monotonically increasing sequence;
- location ID and persisted kind;
- `enter` or `exit`;
- event timestamp and local-date key;
- confirmed coordinates when available;
- native configuration generation.

JS reads journal batches and acknowledges only through the highest sequence
successfully applied. A new event appended during import is not removed by an
older acknowledgement. Replayed identical crossings are idempotent.

## Native Workday Coordinator

The coordinator consumes accepted Work crossings from the journal path and
stores only the minimal native state required while JS is absent:

- IDs of Work locations currently considered inside;
- pending exit token, timestamp, and local-date key;
- whether its 45-minute question was shown;
- resolution state.

### Enter

- Add the Work location ID to the inside set.
- Cancel any unresolved pending exit, its timers, and its visible notification.
- Journal the enter so JS can propose the day's first `started_at`.
- A stale notification action for the cancelled token becomes a no-op.

### Exit

- Remove the Work location ID from the inside set.
- If another Work location remains inside, do not open a pending end.
- If the set becomes empty, replace any pending exit with this exit's timestamp
  and a new token.
- Schedule the question for exit plus 45 minutes.

### Forty-five-minute question

At or after the threshold, re-check the token and inside-Work set. If still
valid:

- mark the pending exit as prompted;
- append a `day_end_prompted` journal event;
- show a native notification with Yes and No actions;
- schedule the unanswered fallback for eight hours after the prompt time.

The running foreground service uses an in-process deadline for timely delivery.
An Android inexact allow-while-idle alarm is the restart/Doze fallback. The
question is never shown before 45 minutes, but Android may deliver it later
during deep idle. The app will not request special exact-alarm permission for
this non-alarm-clock use case.

### Resolution

- Yes appends `day_end_confirmed` for the token and dismisses the notification.
- No appends `day_end_rejected`, dismisses the notification, and clears pending
  state without setting an end.
- At eight unanswered hours after prompting, append `day_end_assumed` and
  dismiss the notification.
- A Work enter before resolution cancels the token. A response arriving after
  cancellation is ignored.

Home and other saved-place crossings never enter this state machine.

## JS Reconciliation and SQLite

Reconciliation runs after database initialization, whenever the app becomes
active, and after a live native journal notification.

For each acknowledged batch in sequence:

1. Store accepted enter/exit records in `geofence_events` using the event's
   timestamp-derived local day.
2. For the first accepted Work enter, set `started_at` with source `auto` only
   if the day has no start.
3. On `day_end_prompted`, create or refresh the existing pending confirmation
   row so the in-app banner mirrors the native notification.
4. On `day_end_confirmed` or `day_end_assumed`, set `ended_at` with source
   `auto` only if the day has no manual end, and resolve the confirmation.
5. On `day_end_rejected` or cancellation, resolve/remove the pending
   confirmation and leave `ended_at` empty.
6. Acknowledge the native sequence only after all corresponding SQLite writes
   succeed.

Applying a replay must produce the same database state. Native notification
actions do not require JS to be awake; SQLite catches up on the next successful
reconciliation.

The old JS live-fix workday inference, one-hour timer, Home auto-accept, and
write-before-confirm behavior are removed rather than maintained as a second
decision engine.

## Native Fix Buffer

The existing fix buffer remains the fallback for fused fixes produced while no
React context is available. Its destructive "read then delete" drain changes to
peek/ack semantics so a JS or SQLite failure during import cannot erase the
unprocessed batch.

The buffer is not a second tracking engine. It is only durable transport from
the native owner to the application database.

## Today, Home, and Quick Add

### Day-store refresh

`loadToday()` always recomputes the current local date. A refresh path rereads
SQLite even when the day exists in `daysCache`; the cache remains useful for
rendering but cannot satisfy an explicit focus/foreground refresh.

### Home

Home keeps the displayed date in state and calls the same refresh operation on:

- initial mount;
- Home tab focus;
- every Home-icon/tab press, including when Home is already focused;
- app foreground activation.

That operation recomputes the local date, updates the `DayView` date prop, loads
the current day row, and reloads entries for that row. The header date and body
therefore use the same day key.

### Quick Add

Quick Add resolves the target at press time:

1. compute `todayDate()`;
2. get or create that exact day;
3. navigate with both `date` and `dayId` from the same result.

It never falls back to a cached `today.id` with an omitted date. Explicit
day-detail quick-add continues to use its supplied `{date, dayId}` pair.

The Today map refreshes its day through the same current-day operation instead
of loading only when `today` is null.

## Lifecycle and Failure Handling

- No receiver requires `LocationService.instance` merely to record a crossing
  or notification response.
- No receiver requires a React context for durable state changes.
- Native journal and coordinator writes are serialized and atomic at the
  app-private file/preferences boundary.
- A failed live JS emit is harmless because the event remains unacknowledged.
- A service restart reconstructs deadlines from persisted timestamps rather
  than restarting a full 45-minute or eight-hour duration.
- Location and Activity Recognition permission denial remain visible diagnostic
  states; tracking falls back only where technically possible and never invents
  crossings.
- Explicit Android force-stop/user-stop is a platform boundary: Android blocks
  app background execution until the user opens the app again. On next launch,
  the app reports the interruption where detectable and re-registers enabled
  monitoring. The design does not claim to bypass force-stop.

## Diagnostics

Native diagnostics record state transitions without exposing extra user data:

- activity transition/sample and confidence;
- tracking `fast`, `slow`, and `idle` changes with reason;
- movement lease renewal/expiry;
- candidate versus confirmed geofence transition;
- journal append/read/ack sequence;
- work pending-exit create/cancel/prompt/confirm/reject/assume;
- service create/start/destroy and restored state;
- permission or background-start failure.

The diagnostic export retains enough timestamps to calculate wake-to-first-fix
latency and prove that a movement wake was not immediately undone.

## Testing

### Pure native tests

- movement wake from each supported activity enters `fast`;
- movement lease blocks immediate fast-to-idle regression;
- slow walking activity keeps tracking active below 1 m/s GPS speed;
- GPS speed hysteresis changes 4-second/2-second tiers;
- stationary evidence reaches `idle` without reading geofence state;
- repeated same-direction place events deduplicate;
- overlapping Work geofences open a pending exit only after the final exit;
- Work re-entry before prompt cancels pending;
- Work re-entry after prompt cancels notification and makes its actions stale;
- Home events have no workday effect;
- 45-minute prompt never fires early;
- Yes, No, and eight-hour unanswered outcomes match the product rules;
- service reconstruction preserves remaining deadlines.

### JS tests

- journal reconciliation is ordered and acknowledgements follow successful DB
  writes;
- replaying a batch is idempotent;
- manual day times are not overwritten;
- first Work enter proposes start;
- rejected/cancelled exit leaves end empty;
- confirmed/assumed exit sets the correct timestamp;
- failed reconciliation leaves the batch unacknowledged;
- Home refresh changes July 21 to July 22 without process restart;
- pressing an already-selected Home tab refreshes;
- Quick Add at midnight uses a matching current date/day ID pair;
- explicit historical-day Quick Add remains unchanged.

### Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint -- --max-warnings=0`
- `cd android && ./gradlew :app:testDebugUnitTest :app:compileDebugKotlin`
- debug APK build and install;
- controlled device scenarios: stationary-to-walk, stationary-to-car,
  slow-walk-to-car, leave Work then return within 45 minutes, remain away and
  answer Yes/No, remain unanswered, stop at Home mid-day, multiple Work
  locations, midnight Home/Quick Add refresh;
- compare new diagnostics against the supplied real-user log and backup without
  modifying the originals.

## Migration and Removal

- Preserve existing `days`, `entries`, `locations`, `geofence_events`, and
  `day_end_confirmations` data.
- Clear obsolete native parked geofences and register the new persisted place
  set once after upgrade.
- Do not reinterpret historical crossings or overwrite historical manual times.
- Remove the dedicated parked-exit geofence path, JS background mode ladder,
  Home-arrival auto-end behavior, and one-hour pending-exit inference after the
  replacement tests are green.
- Keep foreground-only JS tracking for users who intentionally disable
  background tracking.

## Acceptance Criteria

1. A native movement wake cannot be returned to idle by stale JS state.
2. Sustained slow walking and stationary-to-car movement produce timely GPS
   fixes regardless of saved-place membership.
3. Accepted Work crossings survive absent JS and ordinary service/process
   recreation.
4. Leaving the final Work location prompts no earlier than 45 minutes using the
   latest unresolved exit.
5. Re-entering any Work location before resolution cancels that exit.
6. Home arrival never resolves the workday.
7. No stores an explicit rejection and leaves the day end unset.
8. Eight unanswered hours after the prompt accepts the exit.
9. Home and Quick Add use the actual current local day without killing the app.
10. Existing usage data and media remain intact.
11. The full automated verification set passes and the device diagnostics show
    no immediate wake-to-idle regression.

## Deliberate Non-Goals

- No custom accelerometer classifier or Kalman-filter redesign.
- No server sync or browser workday editor.
- No iOS implementation beyond preserving portable JS interfaces.
- No exact-alarm special permission.
- No automatic recovery after an explicit Android force-stop until the user
  opens the app, because the platform intentionally blocks it.
