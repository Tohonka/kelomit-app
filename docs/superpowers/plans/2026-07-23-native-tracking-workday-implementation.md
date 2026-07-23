# Native Tracking and Workday Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android own background movement, GPS cadence, saved-place crossings, work-exit timers, and confirmation actions without requiring a live React runtime.

**Architecture:** Replace saved-place-dependent parking with a native `fast`/`slow`/`idle` tracker. Persist saved-place configuration and accepted native events before any JS emit, run the pending-work-exit state machine natively, then let JS reconcile acknowledged event batches into the existing SQLite schema.

**Tech Stack:** React Native 0.86, Kotlin, Google Play Services Location 21.3.0, Android foreground service/BroadcastReceiver/AlarmManager/SharedPreferences, TypeScript, Zustand, op-sqlite, Jest, JUnit 4.

## Global Constraints

- Saved perimeters are used only to confirm enter/exit; they never select GPS power mode.
- Moving Activity Recognition wakes native GPS immediately and holds it for at least two minutes.
- Work exit prompt: no earlier than 45 minutes after the latest unresolved final Work exit.
- Unanswered fallback: eight hours after the prompt is shown.
- Home crossings never confirm or cancel workday end.
- Do not write `days.ended_at` until Yes or the eight-hour assumption.
- Re-entering any Work location cancels an unresolved exit and stale notification actions.
- Manual day times are never overwritten.
- Reuse Play Services and Android platform APIs; add no runtime dependency.
- Preserve all existing user data and do not modify `realUserData`.
- Keep foreground-only JS tracking when the user disables background tracking.

---

### Task 1: Native tracking policy

**Files:**
- Create: `android/app/src/main/java/com/kelomitapp/location/TrackingPolicy.kt`
- Create: `android/app/src/test/java/com/kelomitapp/location/TrackingPolicyTest.kt`
- Modify: `android/app/build.gradle`

**Interfaces:**
- Produces: `TrackingPolicy.State`, `TrackingPolicy.Signal`, and `TrackingPolicy.reduce(state, signal)`.
- Consumed by: `LocationService` in Task 6.

- [ ] **Step 1: Add the smallest JVM-test dependency**

Add under `dependencies` in `android/app/build.gradle`:

```gradle
testImplementation("junit:junit:4.13.2")
```

- [ ] **Step 2: Write failing policy tests**

Create `TrackingPolicyTest.kt` with fixed elapsed-realtime values:

```kotlin
package com.kelomitapp.location

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackingPolicyTest {
  @Test fun activityWakeEntersFastAndStartsLease() {
    val out = TrackingPolicy.reduce(
      TrackingPolicy.State(mode = TrackingPolicy.Mode.IDLE),
      TrackingPolicy.Signal.Moving(nowMs = 10_000L),
    )
    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(130_000L, out.movingUntilMs)
  }

  @Test fun staleStillFixCannotUndoMovementLease() {
    val moving = TrackingPolicy.State(
      mode = TrackingPolicy.Mode.FAST,
      movingUntilMs = 130_000L,
      stillFixes = 99,
    )
    val out = TrackingPolicy.reduce(
      moving,
      TrackingPolicy.Signal.StillFix(nowMs = 10_050L),
    )
    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(0, out.stillFixes)
  }

  @Test fun slowWalkSampleRenewsLeaseBelowGpsSpeedThreshold() {
    val out = TrackingPolicy.reduce(
      TrackingPolicy.State(mode = TrackingPolicy.Mode.SLOW),
      TrackingPolicy.Signal.Moving(nowMs = 200_000L),
    )
    assertEquals(TrackingPolicy.Mode.FAST, out.mode)
    assertEquals(320_000L, out.movingUntilMs)
  }

  @Test fun stationaryEvidenceEventuallyIdlesWithoutGeofenceInput() {
    var state = TrackingPolicy.State(mode = TrackingPolicy.Mode.FAST)
    repeat(TrackingPolicy.STILL_FIXES_TO_SLOW) {
      state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.StillFix(500_000L))
    }
    assertEquals(TrackingPolicy.Mode.SLOW, state.mode)
    repeat(TrackingPolicy.STILL_FIXES_TO_IDLE) {
      state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.StillFix(700_000L))
    }
    assertEquals(TrackingPolicy.Mode.IDLE, state.mode)
  }

  @Test fun speedTierUsesExistingHysteresis() {
    var state = TrackingPolicy.State(mode = TrackingPolicy.Mode.FAST, intervalMs = 4_000L)
    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(3.5f, 1L))
    assertEquals(2_000L, state.intervalMs)
    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(2.5f, 2L))
    assertEquals(2_000L, state.intervalMs)
    state = TrackingPolicy.reduce(state, TrackingPolicy.Signal.MovingFix(2.4f, 3L))
    assertEquals(4_000L, state.intervalMs)
  }
}
```

- [ ] **Step 3: Run the test and confirm RED**

Run:

```bash
cd android
./gradlew :app:testDebugUnitTest --tests com.kelomitapp.location.TrackingPolicyTest
```

Expected: compilation failure because `TrackingPolicy` does not exist.

- [ ] **Step 4: Implement the pure reducer**

Create `TrackingPolicy.kt` with:

```kotlin
package com.kelomitapp.location

object TrackingPolicy {
  const val FAST_MS = 4_000L
  const val SPRINT_MS = 2_000L
  const val MOVING_LEASE_MS = 120_000L
  const val STILL_FIXES_TO_SLOW = 3
  const val STILL_FIXES_TO_IDLE = 2

  enum class Mode { FAST, SLOW, IDLE }

  data class State(
    val mode: Mode = Mode.FAST,
    val intervalMs: Long = FAST_MS,
    val movingUntilMs: Long = 0L,
    val stillFixes: Int = 0,
  )

  sealed interface Signal {
    data class Moving(val nowMs: Long) : Signal
    data class MovingFix(val speedMs: Float, val nowMs: Long) : Signal
    data class StillFix(val nowMs: Long) : Signal
  }

  fun reduce(state: State, signal: Signal): State = when (signal) {
    is Signal.Moving -> state.copy(
      mode = Mode.FAST,
      intervalMs = FAST_MS,
      movingUntilMs = signal.nowMs + MOVING_LEASE_MS,
      stillFixes = 0,
    )
    is Signal.MovingFix -> {
      val sprintThreshold = if (state.intervalMs == SPRINT_MS) 2.5f else 3.5f
      state.copy(
        mode = Mode.FAST,
        intervalMs = if (signal.speedMs >= sprintThreshold) SPRINT_MS else FAST_MS,
        movingUntilMs = signal.nowMs + MOVING_LEASE_MS,
        stillFixes = 0,
      )
    }
    is Signal.StillFix -> {
      if (signal.nowMs < state.movingUntilMs) {
        state.copy(stillFixes = 0)
      } else {
        val next = state.stillFixes + 1
        when {
          state.mode == Mode.FAST && next >= STILL_FIXES_TO_SLOW ->
            state.copy(mode = Mode.SLOW, stillFixes = 0)
          state.mode == Mode.SLOW && next >= STILL_FIXES_TO_IDLE ->
            state.copy(mode = Mode.IDLE, stillFixes = 0)
          else -> state.copy(stillFixes = next)
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run GREEN**

Run the Task 1 test command again. Expected: five passing tests.

- [ ] **Step 6: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/kelomitapp/location/TrackingPolicy.kt android/app/src/test/java/com/kelomitapp/location/TrackingPolicyTest.kt
git commit -m "feat(location): add native tracking policy"
```

---

### Task 2: Durable native saved-place state and event journal

**Files:**
- Create: `android/app/src/main/java/com/kelomitapp/location/NativePlaceStore.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/NativeTrackingSettings.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/NativeEventJournal.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Modify: `src/native/backgroundLocation.ts`
- Create: `__tests__/nativeEventJournal.test.ts`

**Interfaces:**
- Produces native bridge methods:
  - `syncPlaces(places: MonitoredPlace[]): Promise<void>`
  - `readNativeEvents(): Promise<string[]>`
  - `ackNativeEvents(sequence: number): Promise<void>`
- Produces `subscribeNativeEventAvailable(cb)` for immediate reconciliation when
  a React context is live.
- Produces TS `NativeJournalEvent` discriminated union and `parseNativeEvent`.
- Consumed by Tasks 3–7.

- [ ] **Step 1: Write the failing JS codec test**

Create `__tests__/nativeEventJournal.test.ts`:

```typescript
import {parseNativeEvent} from '../src/native/backgroundLocation';

test('parses a persisted crossing with its native sequence', () => {
  expect(parseNativeEvent(JSON.stringify({
    sequence: 7,
    type: 'crossing',
    locationId: 4,
    kind: 'work',
    direction: 'exit',
    timestamp: 1784810000000,
    latitude: null,
    longitude: null,
  }))).toEqual({
    sequence: 7,
    type: 'crossing',
    locationId: 4,
    kind: 'work',
    direction: 'exit',
    timestamp: 1784810000000,
    latitude: null,
    longitude: null,
  });
});

test('rejects malformed native events', () => {
  expect(parseNativeEvent('{"type":"crossing"}')).toBeNull();
  expect(parseNativeEvent('not json')).toBeNull();
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/nativeEventJournal.test.ts
```

Expected: `parseNativeEvent` is not exported.

- [ ] **Step 3: Implement persisted place storage**

`NativePlaceStore` must use one `SharedPreferences` file and expose:

```kotlin
data class NativePlace(
  val id: Long,
  val kind: String,
  val latitude: Double,
  val longitude: Double,
  val radiusM: Float,
)

class NativePlaceStore(context: Context) {
  fun replace(places: List<NativePlace>)
  fun all(): List<NativePlace>
  fun byId(id: Long): NativePlace?
  fun insideIds(): Set<Long>
  fun setInsideIds(ids: Set<Long>)
}
```

Store the place array and inside-ID set as JSON strings. `replace` increments a
persisted generation and drops inside IDs that no longer exist.

- [ ] **Step 4: Persist native tracking enablement and slow interval**

`NativeTrackingSettings` uses one SharedPreferences file:

```kotlin
class NativeTrackingSettings(context: Context) {
  var enabled: Boolean
  var slowIntervalMs: Long
}
```

The native start/stop bridge updates it in Task 6. Receivers and boot
registration read it instead of depending on JS module state.

- [ ] **Step 5: Implement append/read/ack journal semantics**

`NativeEventJournal` must serialize writes with `@Synchronized`, assign a
persisted monotonically increasing sequence, append JSONL, read all entries
without deleting, and acknowledge only entries whose sequence is at or below
the supplied value:

```kotlin
class NativeEventJournal(private val context: Context) {
  @Synchronized fun append(type: String, fields: Map<String, Any?>): Long
  @Synchronized fun readLines(): List<String>
  @Synchronized fun ackThrough(sequence: Long)
}
```

Use a temporary file plus atomic rename for `ackThrough`; never delete the live
journal before the replacement is ready.

- [ ] **Step 6: Notify live JS only after durable append**

After a successful append, best-effort emit `onNativeEventAvailable` through
`ReactApplication.reactHost.currentReactContext`. The event contains only the
new highest sequence. A null React context is not an error because the journal
is authoritative.

- [ ] **Step 7: Extend the native bridge**

Replace `monitorPlaces` parsing with `syncPlaces`, which persists the complete
replacement set. Task 3 extends it with registration after `PlaceMonitor`
exists. Add `readNativeEvents` and `ackNativeEvents`. The promise must reject on
I/O failure instead of silently reporting success.

- [ ] **Step 8: Add the TypeScript bridge and parser**

Add the native methods to `BackgroundLocationNative`, define:

```typescript
export type NativeJournalEvent =
  | {
      sequence: number;
      type: 'crossing';
      locationId: number;
      kind: 'work' | 'home' | 'other';
      direction: 'enter' | 'exit';
      timestamp: number;
      latitude: number | null;
      longitude: number | null;
    }
  | {
      sequence: number;
      type: 'day_end_prompted' | 'day_end_confirmed' | 'day_end_rejected' |
        'day_end_assumed' | 'day_end_cancelled';
      token: string;
      exitTimestamp: number;
      timestamp: number;
    };
```

`parseNativeEvent` validates the common sequence/type/timestamp and every
variant-specific field. Add wrappers for sync/read/ack that propagate errors to
the reconciler, plus:

```typescript
export function subscribeNativeEventAvailable(
  cb: () => void,
): {remove: () => void}
```

- [ ] **Step 9: Run GREEN and native compile**

```bash
npm test -- --runInBand __tests__/nativeEventJournal.test.ts
cd android
./gradlew :app:compileDebugKotlin
```

Expected: both commands exit 0.

- [ ] **Step 10: Commit**

```bash
git add __tests__/nativeEventJournal.test.ts src/native/backgroundLocation.ts android/app/src/main/java/com/kelomitapp/location/NativePlaceStore.kt android/app/src/main/java/com/kelomitapp/location/NativeTrackingSettings.kt android/app/src/main/java/com/kelomitapp/location/NativeEventJournal.kt android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt
git commit -m "feat(location): persist native places and events"
```

---

### Task 3: Confirm and persist saved-place crossings natively

**Files:**
- Create: `android/app/src/main/java/com/kelomitapp/location/PlaceMembership.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/PlaceMonitor.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/PlaceBootReceiver.kt`
- Create: `android/app/src/test/java/com/kelomitapp/location/PlaceMembershipTest.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/GeofenceCrossingReceiver.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces `PlaceMembership.reduce(places, insideIds, fix)` returning updated
  IDs and accepted crossings.
- Produces `PlaceMonitor.sync(context)` and `PlaceMonitor.onCandidate(context)`.
- Appends `crossing` journal entries consumed by Task 4 and Task 5.

- [ ] **Step 1: Write RED membership tests**

Cover configured-radius enter, 1.25× exit hysteresis, repeated enter
deduplication, multiple places, and state preservation across a new reducer
instance. The key assertion:

```kotlin
@Test fun savedRadiusNotOsFloorControlsAcceptedEnter() {
  val place = NativePlace(1, "work", 60.0, 24.0, 20f)
  val outside = PlaceMembership.reduce(listOf(place), emptySet(), Fix(60.0003, 24.0))
  assertEquals(emptyList<Crossing>(), outside.crossings)
  val inside = PlaceMembership.reduce(listOf(place), emptySet(), Fix(60.0001, 24.0))
  assertEquals("enter", inside.crossings.single().direction)
}
```

- [ ] **Step 2: Run RED**

```bash
cd android
./gradlew :app:testDebugUnitTest --tests com.kelomitapp.location.PlaceMembershipTest
```

- [ ] **Step 3: Implement the pure membership reducer**

Use `Location.distanceBetween` only in the Android adapter; keep the reducer
pure by passing `distanceM` per place:

```kotlin
data class PlaceDistance(val place: NativePlace, val distanceM: Float)
data class Crossing(val place: NativePlace, val direction: String)
data class MembershipResult(val insideIds: Set<Long>, val crossings: List<Crossing>)

fun reduce(distances: List<PlaceDistance>, insideIds: Set<Long>): MembershipResult
```

Enter at `distance <= radiusM`; exit at `distance > radiusM * 1.25f`.

- [ ] **Step 4: Implement standalone OS registration**

`PlaceMonitor.sync(context)` reads `NativePlaceStore`, removes/replaces the
single crossing `PendingIntent`, registers ENTER+EXIT geofences with
`setInitialTrigger(0)`, and uses `max(radiusM, 100f)` only as the OS wake radius.
It must not require `LocationService.instance`.

Update `BackgroundLocationModule.syncPlaces` to call `PlaceMonitor.sync(context)`
after the persisted replacement succeeds.

- [ ] **Step 5: Turn geofence callbacks into candidates**

`GeofenceCrossingReceiver` logs the candidate and asks the live service for an
immediate confirming fix. If no instance exists, record a persisted candidate
timestamp. When persisted background tracking is enabled, call
`ContextCompat.startForegroundService(context, Intent(context,
LocationService::class.java))`; catch
`ForegroundServiceStartNotAllowedException` and `SecurityException`, log the
class name, and leave the candidate queued for the next permitted service start.

- [ ] **Step 6: Apply membership on every native fix**

In `LocationService.emitLocation`, before JS emit/buffer:

1. load persisted places and inside IDs;
2. calculate exact distance;
3. reduce membership;
4. save new inside IDs;
5. append each accepted crossing before any live JS event;
6. emit the accepted crossing to the coordinator callback added in Task 4.

Until Task 4 adds that callback, Task 3 ends after the durable journal append so
it compiles and is independently testable.

- [ ] **Step 7: Add boot re-registration**

Add a small non-exported `PlaceBootReceiver` for `BOOT_COMPLETED` that calls
`PlaceMonitor.sync(context)` only when persisted tracking is enabled. Add
`RECEIVE_BOOT_COMPLETED` and the receiver manifest entry. The same receiver
handles `MY_PACKAGE_REPLACED` so app updates re-register the persisted set.

- [ ] **Step 8: Run GREEN and compile**

Run the Task 3 unit test plus `./gradlew :app:compileDebugKotlin`.

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/kelomitapp/location/PlaceMembership.kt android/app/src/main/java/com/kelomitapp/location/PlaceMonitor.kt android/app/src/main/java/com/kelomitapp/location/PlaceBootReceiver.kt android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt android/app/src/main/java/com/kelomitapp/location/GeofenceCrossingReceiver.kt android/app/src/main/java/com/kelomitapp/location/LocationService.kt android/app/src/test/java/com/kelomitapp/location/PlaceMembershipTest.kt
git commit -m "feat(location): persist confirmed place crossings"
```

---

### Task 4: Native pending-work-exit state and notification

**Files:**
- Create: `android/app/src/main/java/com/kelomitapp/location/WorkdayPolicy.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/WorkdayCoordinator.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/DayEndAlarmReceiver.kt`
- Create: `android/app/src/main/java/com/kelomitapp/location/DayEndActionReceiver.kt`
- Create: `android/app/src/test/java/com/kelomitapp/location/WorkdayPolicyTest.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/res/values-fi/strings.xml`
- Modify: `src/native/backgroundLocation.ts`

**Interfaces:**
- Consumes accepted Work crossings from Task 3.
- Appends `day_end_*` journal events from Task 2.
- Produces native Yes/No notification actions independent of JS.

- [ ] **Step 1: Write RED policy tests**

Use a pure state/result API:

```kotlin
val exited = WorkdayPolicy.reduce(
  State(insideWorkIds = setOf(1L)),
  Event.Exit(1L, atMs = 1_000L),
)
assertEquals(1_000L, exited.state.pending!!.exitAtMs)
assertEquals(46 * 60_000L, exited.effects.single().atMs)
```

Add separate tests for:

- exit while another Work ID remains;
- re-entry before 45 minutes;
- re-entry after prompt;
- Home input having no API path/effect;
- prompt at 45 minutes, never earlier;
- Yes, No, and assumption eight hours after prompt;
- stale token action no-op;
- later final exit replacing the cancelled exit timestamp.

- [ ] **Step 2: Run RED**

```bash
cd android
./gradlew :app:testDebugUnitTest --tests com.kelomitapp.location.WorkdayPolicyTest
```

- [ ] **Step 3: Implement the pure policy**

Define:

```kotlin
const val PROMPT_DELAY_MS = 45 * 60_000L
const val ASSUME_DELAY_MS = 8 * 60 * 60_000L

data class Pending(
  val token: String,
  val exitAtMs: Long,
  val promptAtMs: Long,
  val promptedAtMs: Long? = null,
)

data class State(
  val insideWorkIds: Set<Long> = emptySet(),
  val pending: Pending? = null,
)
```

Effects are `SchedulePrompt`, `ScheduleAssumption`, `CancelTimers`,
`ShowPrompt`, `CancelPrompt`, and `Journal(type, token, exitAtMs)`. The reducer
must compare tokens before every resolution.

- [ ] **Step 4: Persist and execute effects**

`WorkdayCoordinator` stores serialized state in SharedPreferences, serializes
all state transitions, schedules an in-process service deadline plus
`AlarmManager.setAndAllowWhileIdle` fallback, and reconstructs remaining
deadlines on service start.

- [ ] **Step 5: Connect accepted Work crossings**

After Task 3 appends an accepted crossing, call
`WorkdayCoordinator.onCrossing(locationId, direction, timestamp)` only when the
persisted place kind is `work`. Home and other kinds never reach this method.
On service start, call `WorkdayCoordinator.restoreDeadlines()`.

- [ ] **Step 6: Add native notification and actions**

Use channel ID `day-end`, notification ID derived from the token, and two
immutable broadcast actions carrying the token. `DayEndActionReceiver` reloads
state, ignores stale tokens, applies Yes/No, appends the journal result, and
dismisses the notification.

English resources:

```xml
<string name="day_end_channel_name">Workday confirmation</string>
<string name="day_end_title">Workday finished?</string>
<string name="day_end_question">Did your day end at %1$s?</string>
<string name="day_end_yes">Yes</string>
<string name="day_end_no">No</string>
```

Create Finnish equivalents under `values-fi`.

- [ ] **Step 7: Add native response bridge**

Add `respondToDayEnd(token: String, confirmed: Boolean, promise: Promise)` to
`BackgroundLocationModule`; it delegates to the coordinator's token-checked
Yes/No event. Add the matching TypeScript wrapper.

- [ ] **Step 8: Run GREEN and compile**

Run the Task 4 test and `./gradlew :app:compileDebugKotlin`.

- [ ] **Step 9: Commit**

```bash
git add src/native/backgroundLocation.ts android/app/src/main/AndroidManifest.xml android/app/src/main/res/values/strings.xml android/app/src/main/res/values-fi/strings.xml android/app/src/main/java/com/kelomitapp/location/LocationService.kt android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt android/app/src/main/java/com/kelomitapp/location/WorkdayPolicy.kt android/app/src/main/java/com/kelomitapp/location/WorkdayCoordinator.kt android/app/src/main/java/com/kelomitapp/location/DayEndAlarmReceiver.kt android/app/src/main/java/com/kelomitapp/location/DayEndActionReceiver.kt android/app/src/test/java/com/kelomitapp/location/WorkdayPolicyTest.kt
git commit -m "feat(workday): handle pending exits natively"
```

---

### Task 5: Reconcile native journal into SQLite

**Files:**
- Create: `src/services/nativeEventSync.ts`
- Create: `__tests__/nativeEventSync.test.ts`
- Modify: `src/db/migrations.ts`
- Modify: `src/db/dayConfirmations.ts`
- Modify: `src/types/index.ts`
- Modify: `src/services/notificationService.ts`
- Modify: `src/components/day/DayEndConfirmBanner.tsx`
- Modify: `index.js`

**Interfaces:**
- Consumes Task 2 `readNativeEvents`/`ackNativeEvents`.
- Produces `reconcileNativeEvents(): Promise<void>`.
- Produces token-aware confirmation DB helpers.

- [ ] **Step 1: Write RED reconciliation tests**

Mock the bridge and DB modules. Cover:

```typescript
test('acks only after the whole ordered batch succeeds', async () => {
  readNativeEvents.mockResolvedValue([
    crossing(1, 'work', 'enter', enterMs),
    prompted(2, 'token-1', exitMs, promptMs),
  ]);
  await reconcileNativeEvents();
  expect(insertGeofenceEvent).toHaveBeenCalledBefore(createDayEndConfirmation);
  expect(ackNativeEvents).toHaveBeenCalledWith(2);
});

test('does not ack a failed batch', async () => {
  insertGeofenceEvent.mockRejectedValue(new Error('db unavailable'));
  await expect(reconcileNativeEvents()).rejects.toThrow('db unavailable');
  expect(ackNativeEvents).not.toHaveBeenCalled();
});
```

Also test first Work enter, manual start preservation, confirmed/assumed end,
rejected/cancelled empty end, Home no workday effect, and replay idempotency.

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/nativeEventSync.test.ts
```

- [ ] **Step 3: Add token-aware confirmation helpers**

Add migration 19:

```sql
ALTER TABLE day_end_confirmations ADD COLUMN native_token TEXT
```

Add `native_token: string | null` to `DayEndConfirmation` and
`token: string` to `PendingDayEnd`. Add:

```typescript
createOrReplaceNativeConfirmation(
  dayId: number,
  proposedEnd: string,
  token: string,
): Promise<number>
resolveNativeConfirmation(token: string, confirmed: boolean): Promise<void>
cancelNativeConfirmation(token: string): Promise<void>
```

All are idempotent on `native_token`.

- [ ] **Step 4: Implement ordered reconciliation**

Parse all lines; reject malformed sequence gaps without acknowledging. For each
event:

- crossing: `getOrCreateDay(localDateOf(timestamp))`, persist through
  `recordCrossing`, and set the first Work start only if empty;
- prompted: create pending confirmation only;
- confirmed/assumed: set auto end only if no manual/end value and resolve Yes;
- rejected/cancelled: resolve No/remove pending and leave end unset.

Ack the highest processed sequence after all writes succeed.

- [ ] **Step 5: Make the banner native-response aware**

The in-app Yes/No buttons call a new bridge method
`respondToDayEnd(token, confirmed)` rather than writing `ended_at` directly.
The native coordinator journals the result; reconciliation updates SQLite and
the banner notifier. After the bridge response, the banner awaits
`reconcileNativeEvents()` so it updates immediately even if the live
device-event emit is delayed. Remove Notifee's JS day-end action handling, but
retain Notifee for to-do reminders.

- [ ] **Step 6: Run GREEN**

Run the Task 5 test. The superseded JS inference and its tests are removed
together in Task 7 after `gpsService` no longer imports them.

- [ ] **Step 7: Commit**

```bash
git add __tests__/nativeEventSync.test.ts src/services/nativeEventSync.ts src/db/migrations.ts src/db/dayConfirmations.ts src/types/index.ts src/services/notificationService.ts src/components/day/DayEndConfirmBanner.tsx src/native/backgroundLocation.ts index.js
git commit -m "feat(workday): reconcile native decisions into sqlite"
```

---

### Task 6: Make LocationService the sole Android background tracker

**Files:**
- Modify: `android/app/src/main/java/com/kelomitapp/location/LocationService.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/ActivityTransitionReceiver.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/location/BackgroundLocationModule.kt`
- Delete: `android/app/src/main/java/com/kelomitapp/location/GeofenceExitReceiver.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `src/services/gpsService.ts`
- Modify: `src/services/trackingMode.ts`
- Modify: `src/native/backgroundLocation.ts`
- Modify: `__tests__/trackingMode.test.ts`
- Create: `__tests__/gpsService.test.ts`

**Interfaces:**
- Consumes `TrackingPolicy` from Task 1.
- Keeps JS foreground-only watch when background tracking is disabled.
- Produces native fixes and durable buffer imports.

- [ ] **Step 1: Change JS tests to reject geofence parking**

Remove `parked`, `STREAK_TO_PARK`, and `canPark` expectations. Add:

```typescript
it('has no saved-place-dependent background mode', () => {
  expect(nextTrackingMode('slow', false, 99)).toBe('slow');
});
```

Add a `gpsService` test proving background-native startup does not arm
`Geolocation.watchPosition`.

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/trackingMode.test.ts __tests__/gpsService.test.ts
```

- [ ] **Step 3: Drive native requests from TrackingPolicy**

`LocationService` holds one policy state. Activity wakes and trustworthy moving
fixes reduce it to `FAST`; still fixes reduce toward `SLOW`/`IDLE`. Applying:

- `FAST`/`SLOW`: install one fused request at the policy/configured interval;
- `IDLE`: remove fused updates but keep the foreground service and Activity
  Recognition registrations alive.

Do not read saved-place state when selecting a mode. Persist enough policy state
to restore deadlines after service recreation.

- [ ] **Step 4: Pass and persist the configured slow interval**

Change native `start()` to `start(slowIntervalMs)` and put
`EXTRA_SLOW_INTERVAL` on the service intent. Persist it through
`NativeTrackingSettings` before starting the service so receiver/system
restarts use the same value. `stop()` sets native tracking `enabled=false`
before unregistering activity/place monitoring and stopping the service.

- [ ] **Step 5: Keep Activity Recognition independent of JS**

Register transition delivery plus periodic sampling while `SLOW`/`IDLE`.
`ActivityTransitionReceiver` calls a context-based native controller that can
update persisted movement state even when `LocationService.instance` is null.
If the service is live, apply immediately; otherwise request its permitted
restart and retain the wake state for `onStartCommand`.

Do not unregister Activity Recognition from `LocationService.onDestroy`;
unregister it only from the explicit bridge `stop()` path when tracking is
disabled.

- [ ] **Step 6: Remove parked geofence machinery**

Delete `enterParked`, its `PendingIntent`, `GeofenceExitReceiver`, manifest
entry, bridge method, JS wrapper, and saved-place `canPark` logic. Update the
foreground notification text so it says idle rather than paused at a saved
place.

- [ ] **Step 7: Remove the duplicate JS background watch**

In `startTracking`:

- if background native is enabled, subscribe to native fixes/activity/journal,
  start the service, and do not call `armWatch`;
- otherwise arm the foreground JS watch.

Remove JS calls that retune native mode. Keep JS fix persistence and foreground
fallback behavior.

- [ ] **Step 8: Make native fix-buffer draining non-destructive**

Replace `drainFixBuffer()` with `readFixBuffer()` and `ackFixBuffer(count)`.
Read, persist sequentially, then acknowledge only successfully persisted lines.

- [ ] **Step 9: Run GREEN and compile**

```bash
npm test -- --runInBand __tests__/trackingMode.test.ts __tests__/gpsService.test.ts __tests__/fixBuffer.test.ts
npx tsc --noEmit
cd android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

- [ ] **Step 10: Commit**

```bash
git add -A android/app/src/main src/services/gpsService.ts src/services/trackingMode.ts src/native/backgroundLocation.ts __tests__/trackingMode.test.ts __tests__/gpsService.test.ts __tests__/fixBuffer.test.ts
git commit -m "feat(location): move background tracking ownership native"
```

---

### Task 7: App lifecycle wiring and removal of the old workday engine

**Files:**
- Modify: `App.tsx`
- Modify: `src/store/locationStore.ts`
- Create: `src/services/trackingOrchestrator.ts`
- Create: `__tests__/trackingOrchestrator.test.ts`
- Delete: `src/services/dayDetection.ts`
- Delete: `src/services/endOfDay.ts`
- Delete: `__tests__/endOfDay.test.ts`
- Modify: `src/services/gpsService.ts`

**Interfaces:**
- Starts native reconciliation after DB initialization and every foreground.
- Syncs the full saved-location set after any location mutation.

- [ ] **Step 1: Write failing lifecycle/orchestrator tests**

Extract a small exported `syncTrackingState(settings, locations)` orchestration
function and test:

- enabled background tracking syncs places before starting native service;
- location edit/delete replaces the full persisted set;
- foreground calls `reconcileNativeEvents`;
- live `onNativeEventAvailable` calls `reconcileNativeEvents`;
- disabled tracking unregisters native activity/place monitoring.

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/trackingOrchestrator.test.ts
```

- [ ] **Step 3: Wire startup/resume**

After `initDB`, reconcile native events before rendering day data. On active:

1. reconcile journal;
2. sync current locations natively;
3. restore/start tracking if enabled.

Keep failures diagnostic and retry on the next foreground; do not acknowledge
failed imports.

Register one `subscribeNativeEventAvailable` listener after DB initialization
and remove it on cleanup. Serialize reconciliation calls so foreground and live
events cannot import the same batch concurrently.

- [ ] **Step 4: Replace location mutation callbacks**

After add/remove/radius changes, read the authoritative location list once and
call `syncPlaces`. Remove separate `refreshGeofences` and
`refreshMonitoredPlaces` paths.

- [ ] **Step 5: Delete superseded inference**

Remove one-hour/Home auto-end inference and all `runDayDetection`,
`startDayDetection`, and `stopDayDetection` calls. Delete `dayDetection.ts`,
`endOfDay.ts`, and their test. Keep `crossingStore.ts`: Task 5's reconciler
uses its DB deduplication.

- [ ] **Step 6: Run GREEN**

Run the orchestrator test and the full Jest suite.

- [ ] **Step 7: Commit**

```bash
git add -A App.tsx src/store/locationStore.ts src/services/trackingOrchestrator.ts src/services/gpsService.ts src/services/dayDetection.ts src/services/endOfDay.ts __tests__/endOfDay.test.ts __tests__/trackingOrchestrator.test.ts
git commit -m "refactor(workday): remove js background decision engine"
```

---

### Task 8: Full native/workday verification

**Files:**
- None. This task records verification evidence only.

- [ ] **Step 1: Run all static and automated checks**

```bash
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm test -- --runInBand
cd android
./gradlew :app:testDebugUnitTest :app:compileDebugKotlin :app:assembleDebug
```

Expected: zero lint errors/warnings, zero TypeScript errors, all Jest/JUnit
tests pass, debug APK builds.

- [ ] **Step 2: Check the final diff**

```bash
git diff --check
git status --short
git diff --stat main...HEAD
```

Expected: no whitespace errors; only the pre-existing `.DS_Store` remains
uncommitted.

- [ ] **Step 3: Inspect upgrade safety**

Open the supplied backup read-only and verify schema 18 remains readable. Do not
copy it into the running app and do not alter `realUserData`.

- [ ] **Step 4: Device verification checklist**

Build/install only after backing up on-device data:

1. stationary at Home/Work → tracker reaches native idle;
2. slow walk for over ten seconds → native fast and timely first fix;
3. stationary-to-car → native fast then 2-second tier;
4. Work exit then re-enter before 45 minutes → no prompt;
5. Work exit then stay Home/away → prompt after threshold;
6. answer No → no day end;
7. answer Yes → exit timestamp stored;
8. leave prompt unanswered → eight-hour assumption;
9. enter a second Work location while pending → cancellation;
10. background/React recreation → journal imports once.

- [ ] **Step 5: Compare diagnostics**

Confirm each `wake.activity` is followed by a movement lease and cannot be
followed by immediate idle. Confirm journal sequence continuity and no repeated
registration-time Work enters.

- [ ] **Step 6: Handle a failed check without broadening this task**

If any automated or device check fails, stop this verification task, add a new
corrective task naming the exact production and test files, complete its
RED/GREEN/commit cycle, then restart Task 8 from Step 1. Do not edit files
under this verification-only task and do not create an empty verification
commit.
