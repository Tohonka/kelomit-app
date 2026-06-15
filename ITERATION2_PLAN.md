# Kelomit – Iteration 2 implementation plan

A phased plan for the changes, fixes and feature additions in `kelomit_iteration2.md`.
Each phase is sized to be picked up independently by Claude Code, ordered so that
foundational/blocking work comes first and risky native integrations come last.

**Conventions used below**
- *Files* lists the main existing files to touch (paths relative to repo root).
- *Approach* is the recommended technical direction, not a rigid spec.
- *Acceptance* is the "done" check Claude Code should satisfy (run `npm run check`).
- Items tagged **[migration]** require a new entry in `src/db/migrations.ts` (bump
  `schema_version`, never edit an existing migration).

**Cross-cutting reminder – sync readiness.** `CLAUDE.md` calls for future server
sync and browser editing. For every new table/column added below, keep
`created_at` / `updated_at` (ISO, UTC) and prefer additive migrations. Do not
reuse/recycle row ids. This keeps a later "last-write-wins or per-field sync"
story open without rework. Flagged again where relevant.

---

## Phase 1 – Data freshness & core gesture/UX fixes

Low-risk, high-value bugfixes. No schema changes. Good first pickup.

### 1.1 Calendar not refreshing when entering view
- **Problem:** `CalendarScreen` only reloads hours via `useEffect` keyed on the
  computed range; coming back to the tab after editing a day shows stale totals.
- **Files:** `src/screens/CalendarScreen.tsx`.
- **Approach:** Reload on focus with `useFocusEffect`(`@react-navigation/native`)
  wrapping `loadHours`. Also reload when the screen regains focus after returning
  from `DayScreen`. Confirm `HomeScreen` has the same guarantee (it reloads via
  `loadToday`/`loadEntriesForDay` effects — verify totals refresh after edits).
- **Acceptance:** Edit a day's times/entries, navigate back to Calendar → totals
  are correct without switching view modes.

### 1.2 Swipe to change month/week/day is unreliable & out of order
- **Problem:** The hand-rolled `PanResponder` in `CalendarScreen` misses most
  swipes and (per notes) navigates inconsistently. Day-to-day swiping is also
  wanted in the day view.
- **Files:** `src/screens/CalendarScreen.tsx`, `src/screens/DayScreen.tsx`.
- **Approach:** Replace the `PanResponder` with a gesture library already suited
  to RN. Recommended: `react-native-gesture-handler` (Fling/Pan) which is the
  modern standard and plays well with `react-native-screens` (already a dep). For
  month/week use a horizontal `FlingGesture` (left = forward, right = back) with a
  clear threshold; ensure `goBack`/`goForward` always step by exactly one
  period from the *currently displayed* period (the reported "june 8 → 9 then
  stuck" smells like state being derived from `new Date()`/`currentDate` drift —
  normalise `currentDate` to the period start on every step). For the day view,
  add the same left/right step on the displayed date.
- **Note:** Adds a native dependency → requires a rebuild. Wrap app root in
  `GestureHandlerRootView` (check `App.tsx`/`index.js`).
- **Acceptance:** Swiping left/right always advances/retreats by one
  month/week/day, repeatedly, in order; day view supports the same.

### 1.3 Per-segment hour totals in Today / day view
- **Problem:** Day has up to two work segments (`started_at/ended_at` +
  `started_at_2/ended_at_2`). User wants a per-segment hour figure shown next to
  each segment, with the grand total staying in the upper-right (already present
  in `HomeScreen` header). Helps spot bad time entries at a glance.
- **Files:** `src/components/day/DaySummaryCard.tsx`, `src/utils/hoursUtils.ts`
  (add a per-segment helper if not present), `src/screens/DayScreen.tsx`.
- **Approach:** Compute and render each segment's duration inline in
  `DaySummaryCard`. Keep `calcDayWorkSecs` as the source of the total. Show "—"
  when a segment is incomplete/open.
- **Acceptance:** Each filled segment shows its own hours; header total = sum of
  segments + counted entries; obviously-wrong times are visually easy to catch.

### 1.4 Keyboard covers input fields (tags, description, etc.)
- **Problem:** When typing tags/description in `AddEntryModal`, the keyboard hides
  the field ("writing blind").
- **Files:** `src/screens/AddEntryModal.tsx`, `src/screens/EntryDetailScreen.tsx`,
  any other text-entry screens.
- **Approach (modern Android-friendly):** Two complementary fixes:
  1. Make the modal reliably scroll the focused field into view. The current
     `KeyboardAvoidingView` uses `behavior` only on iOS; on Android set
     `android:windowSoftInputMode="adjustResize"` in `AndroidManifest.xml` and
     ensure the `ScrollView` has `keyboardShouldPersistTaps="handled"` (already)
     plus auto-scroll to the focused input.
  2. For the heaviest case (tag entry), consider `react-native-keyboard-controller`
     (its `KeyboardAwareScrollView` / sticky `KeyboardStickyView`) — this matches
     Material guidance of keeping the active field + its affordances above the
     keyboard. This library also unlocks the "helper modal above keyboard"
     idea the notes mention for future extended input options.
- **Recommendation:** Start with the manifest + `KeyboardAwareScrollView`
  approach (option 1, the Google-recommended `adjustResize`); only add the
  above-keyboard accessory bar if still needed.
- **Acceptance:** Tag and description fields stay fully visible while typing on a
  real device; no content hidden behind the keyboard.

---

## Phase 2 – Settings subsections + hybrid time selector

The notes explicitly want Settings to gain subsections "starting now," with the
new time-selector preferences living under an **Interface** subsection. Do the
navigation restructure first because later phases (Quick add settings, GPS
settings) also need subsections.

### 2.1 Settings subsections (nested navigation)
- **Files:** `src/screens/SettingsScreen.tsx`, `src/navigation/RootNavigator.tsx`,
  `src/navigation/navigationTypes.ts`, new screens under `src/screens/settings/`.
- **Approach:** Turn the flat Settings list into a menu of subsections that push
  detail screens (native-stack rows with a `›` caret, matching the existing
  Projects/Export pattern). Initial subsections:
  - **Interface** – theme, week numbers, **time selector style** (2.2).
  - **Tracking** – GPS toggle, default activity (existing).
  - **Data** – Projects, Export CSV (existing).
  - (Reserved for **Quick add** in Phase 4, **Location** in Phase 7.)
  Add new routes to `RootStackParamList` and a small settings sub-navigator or
  individual stack screens.
- **Acceptance:** Settings is a list of subsections; each opens its own screen;
  all existing settings still work.

### 2.2 Hybrid time selector (type + analog clockface)
- **Problem:** The current `TimePicker` opens the native spinner
  (`@react-native-community/datetimepicker`, `display="spinner"`), which the user
  finds slow. Wants: type the time directly **or** pick from UI, with an **analog
  clockface** as the preferred picker, selectable as an option.
- **Files:** `src/components/ui/TimePicker.tsx` (and everywhere it's used:
  `AddEntryModal`, `DaySummaryCard`/day time editing).
- **Approach:** Build a custom time-entry component with two input modes the user
  can switch between, persisted in settings:
  - **Keyboard mode:** two-field `HH` `MM` numeric inputs (auto-advance, 24h),
    fast for power use.
  - **Clock mode:** Material-style analog clock face. On Android the platform
    `datetimepicker` with `display="clock"` already renders the Material clock —
    cheapest path is to switch the existing picker to `display="clock"` and add a
    typed-entry fallback. For a fully custom/cross-platform clock, evaluate a
    maintained lib (e.g. `react-native-paper-dates` time picker, which offers
    both clock + keyboard entry in one component and is well maintained) before
    hand-rolling.
- **Setting:** `time_selector_mode` (`'clock' | 'keyboard'`, default `'clock'`)
  added in a **[migration]** + `settingsStore`, surfaced under Settings →
  Interface.
- **Recommendation:** Prefer `react-native-paper-dates` time picker — it already
  delivers the exact "type or use the clock face" hybrid, reducing custom code.
  If avoiding the Paper dependency, switch Android to `display="clock"` and add a
  typed `HH:MM` row.
- **Acceptance:** User can set time by typing or via clock face; default is clock;
  preference is saved and respected everywhere time is edited.

---

## Phase 3 – "Share to" (inbound share intent)

Standalone, self-contained native feature. Can run in parallel with Phase 2.

- **Goal:** Let the user share content from other apps *into* Kelomit (e.g. a
  photo, a link, text) to create an entry.
- **Files:** Android native config (`android/app/src/main/AndroidManifest.xml`),
  new service `src/services/shareIntakeService.ts`, hook into `AddEntryModal`
  (pre-fill from shared payload), `src/navigation/RootNavigator.tsx` (deep entry).
- **Approach:** Add an Android `intent-filter` for `ACTION_SEND` (text, image,
  video, audio mime types). Use `react-native-receive-sharing-intent` (or
  `react-native-share-menu`) to receive the payload on cold/warm start, then route
  to `AddEntryModal` with the file copied into the app media dir via
  `src/utils/mediaUtils.ts` and the title/body pre-filled. Default activity/tag
  follow the same defaults as a normal add.
- **Acceptance:** Sharing a photo/text from another app opens Kelomit's add-entry
  flow with the content attached and saves to today's day.

---

## Phase 4 – Add-entry power features + dual-function nav menu

These improve daily capture speed. 4.1 and 4.2 touch `AddEntryModal`/`FAB`;
4.3 touches navigation. Group them since they share the "fast capture" goal.

### 4.1 Create a project from the add-entry view + searchable project picker
- **Problem:** No way to add a project inline; the horizontal rolling chip row
  won't scale as projects grow.
- **Files:** `src/screens/AddEntryModal.tsx`, `src/store/projectStore.ts`,
  `src/db/projects.ts`, maybe a new `ProjectPicker` component.
- **Approach:** Replace the plain horizontal chip scroller with a picker that
  shows the **3 most-used projects** as quick chips + a **"type to search"**
  field + a **"+ New project"** button that creates a project on the fly (name +
  type) and selects it. "Most used" needs a usage signal — derive from
  `COUNT(entries.project_id)` over a recent window (add a query in
  `db/projects.ts`). No schema change strictly required, but optionally add a
  `last_used_at` to `projects` **[migration]** for cheaper ranking.
- **Acceptance:** User can search projects, see top-3 quick picks, and create +
  select a new project without leaving the add screen.

### 4.2 Quick add (long-press FAB) + Quick add settings
- **Problem:** Wants a fast path: long-pressing `+` expands per-type quick-add
  options; quick add is a minimal modal (title + optional duration only, no
  from/to), defaulting to a simple item add (duration "none").
- **Files:** `src/components/ui/FAB.tsx`, new `QuickAddModal`, new Settings
  subsection screen `src/screens/settings/QuickAddSettings.tsx`,
  `src/store/settingsStore.ts`, **[migration]** for new settings keys.
- **Approach:**
  - Long-press (with the ~300ms delay, see 4.3) on the FAB expands speed-dial
    actions for each entry type (note/photo/video/voice).
  - The quick-add modal exposes only **title** + **duration** (duration defaults
    to none). It applies defaults from settings: default activity = `work`,
    default tag = `Quick add`, default project per settings.
  - New Quick-add settings subsection lets the user set default tag/project/
    activity for quick adds. Keys: `quickadd_default_project_id`,
    `quickadd_default_tag`, `quickadd_default_activity` (defaults: `''`,
    `'Quick add'`, `'work'`).
- **Acceptance:** Long-press FAB → choose type → minimal modal → one-tap save;
  quick-add defaults are configurable in Settings.

### 4.3 Dual-function navigation menu (pull-up secondary actions)
- **Problem:** Keep the bottom bar uncluttered: default shows the 3 base tabs
  (Home/Calendar/Settings); pulling the menu up reveals secondary actions
  (Search, the new Insights button from Phase 5). Needs a ~300ms hold delay
  before the pull engages, to avoid accidental triggers.
- **Files:** `src/navigation/MainTabs.tsx`, a new custom `tabBar` component, and
  the FAB long-press timing (shared 300ms constant).
- **Approach:** Implement a custom bottom bar (custom `tabBar` prop on
  `Tab.Navigator`) that hosts the 3 tabs plus a draggable/pull-up sheet for
  secondary actions. Use `react-native-gesture-handler` (from Phase 1.2) for the
  long-press + pan, with a `LongPress` min duration of 300ms gating the pull.
  Consider `@gorhom/bottom-sheet` for the pulled-up panel if a full sheet is
  wanted.
- **Acceptance:** Base bar shows 3 icons; a deliberate ~300ms hold + pull reveals
  Search/Insights; accidental quick taps never open it.

---

## Phase 5 – Insights, day-split visualisation & search

Depends on Phase 4.3 for where Search/Insights are surfaced.

### 5.1 New "Insights" view (breakdowns & visualisations)
- **Goal:** A dedicated screen (the "button I don't know the name of" — suggest
  **Insights**) with visual + textual breakdowns of time use (by project, tag,
  activity type, period).
- **Files:** new `src/screens/InsightsScreen.tsx`, queries in `src/db/entries.ts`,
  route in `RootNavigator`/`navigationTypes`, entry point from the pull-up menu
  (4.3).
- **Approach:** Aggregate work seconds grouped by project/tag/activity over a
  selectable period (reuse the range logic from `CalendarScreen`). Charts: a
  lightweight RN charting lib (e.g. `react-native-gifted-charts` or
  `victory-native`) for bars/pies, plus a plain ranked list for the textual view.
- **Acceptance:** User picks a period and sees hours split by project/tag/activity
  as both a chart and a list.

### 5.2 Color-coded day-split bar in calendar day view
- **Goal:** "For fun for now" — in the selected-day view, the empty area between
  the header/total row and the tags/projects row shows a horizontal color-coded
  bar representing how the day split across projects/tags.
- **Files:** `src/screens/DayScreen.tsx`, new `DaySplitBar` component, reuse
  project/tag colors from `src/theme/colors.ts` (add a color mapping if projects
  don't yet have stable colors).
- **Approach:** Compute each project's share of the day's counted seconds and
  render proportional segments. Needs a stable per-project color — derive from
  project id hash or add a `color` column to `projects` **[migration]** (nice for
  consistency across the app and the Insights charts).
- **Acceptance:** Opening a day shows a proportional colored bar of project/tag
  split; segments roughly match the listed hours.

### 5.3 Search
- **Goal:** Search across entries (title/body/tags/project) reachable from the
  pull-up menu.
- **Files:** new `src/screens/SearchScreen.tsx`, query in `src/db/entries.ts`.
- **Approach:** SQL `LIKE` across `title`/`body` joined with tags/projects;
  consider an FTS5 virtual table **[migration]** if result speed matters as data
  grows. Tapping a result opens `EntryDetailScreen`.
- **Acceptance:** Typing a query returns matching entries; tapping opens the entry.

---

## Phase 6 – Future items (to-do) & notifications

Bigger feature touching the data model. Do after the capture/UX phases.

### 6.1 Future / to-do items  **[migration]**
- **Goal:** Add items scheduled for upcoming days, marked **to-do**. If a duration
  is set, it does **not** count as worked hours until the item is confirmed on or
  after its date.
- **Files:** `src/db/migrations.ts`, `src/types/index.ts`, `src/db/entries.ts`,
  `src/store/entryStore.ts`, `src/utils/hoursUtils.ts` (exclude unconfirmed
  to-dos from work totals), `AddEntryModal` (mark as to-do + target date),
  relevant screens.
- **Approach:** Add to `entries`: `is_todo INTEGER DEFAULT 0`,
  `scheduled_date TEXT NULL`, `completed_at TEXT NULL`. An entry is "pending
  work" until `completed_at` is set (only settable on/after `scheduled_date`).
  `calcDayWorkSecs` and `getWorkSecondsByDay` must exclude to-dos that aren't yet
  completed. **Sync note:** these are additive columns with timestamps — good.
- **Acceptance:** Can create a to-do for a future date; it doesn't add to worked
  hours until confirmed; confirming on/after the date counts it.

### 6.2 Next-day upcoming items on the Today view
- **Goal:** Show items due "next day" at the very bottom of Home, visually
  distinct. On **Fridays**, "next day" = both Saturday **and** Monday.
- **Files:** `src/screens/HomeScreen.tsx`, query in `src/db/entries.ts`.
- **Approach:** Query to-dos whose `scheduled_date` ∈ next-day set (compute the
  set with the Friday→Sat+Mon rule). Render a muted "Coming up" footer section.
- **Acceptance:** Tomorrow's to-dos appear at the bottom of Today; on Friday both
  Saturday and Monday items show.

### 6.3 Upcoming items in the week view
- **Files:** `src/screens/CalendarScreen.tsx` (`WeekView`).
- **Approach:** Below the week row, list that week's upcoming to-dos if any.
- **Acceptance:** Week view lists that week's upcoming items when present.

### 6.4 Local notifications before an item
- **Goal:** Optional notification at a user-specified lead time before an item.
- **Files:** new `src/services/notificationService.ts`, settings for lead-time,
  hook into to-do create/edit.
- **Approach:** Use **`@notifee/react-native`** (modern, well-maintained local
  notifications + scheduling, good Android channel support) or
  `react-native-push-notification`. Schedule a local trigger at
  `scheduled_datetime - lead`. Handle Android 13+ `POST_NOTIFICATIONS` permission
  (extend `permissionService.ts`). Reschedule/cancel on edit/delete.
- **Note:** Native dependency → rebuild; request notification permission lazily.
- **Acceptance:** Setting a reminder fires a local notification at the chosen lead
  time; editing/deleting the item updates/cancels it.

---

## Phase 7 – GPS automation & location intelligence

Builds on the existing `gpsService`/`locationUtils`/`gps_track` table. Highest
native/permission complexity — do last among features.

### 7.1 Work/home locations  **[migration]**
- **Goal:** Let the user define work (and home) locations. Offer to use
  Android/Google Maps home/work if available; otherwise a simple "Currently at
  work" that saves the current position.
- **Files:** new Settings → **Location** subsection, new table or settings keys,
  `src/services/gpsService.ts`, `src/db/`.
- **Approach:** Store named locations (lat/lng/radius) — a small `locations`
  table is cleaner than settings blobs and is sync-friendly (id + timestamps).
  "Currently at work" reads `getLastKnownPosition()`/a fresh fix and saves it.
  Reading OS home/work is unreliable/locked-down on Android — treat as
  best-effort only; the manual "set current as work" is the reliable primary path.
- **Acceptance:** User can save a work/home location (with radius) from their
  current position and see it in Settings → Location.

### 7.2 Geofenced auto time-stamping
- **Goal:** For a location radius (+ optional from/to timeframe), auto-set the
  day's `from` time on arrival and `to` time on leaving — **never overwriting**
  user-entered values, but always logging every radius exit/enter (so the user
  can reconstruct forgotten logs).
- **Files:** `src/services/gpsService.ts`, day update logic in `src/db/days.ts`/
  `dayStore`, a new `geofence_events` log table **[migration]**.
- **Approach:** In `handlePosition`, compute distance to saved location(s); detect
  enter/leave transitions (with hysteresis to avoid flapping — reuse the outlier
  ideas in `locationUtils.ts`). On enter during the timeframe, set `started_at` if
  empty; on leave, set `ended_at` if empty. Always append an enter/leave row to
  `geofence_events` regardless. Consider Android Activity Recognition / fused
  provider tuning later to reduce drift (already noted in `CLAUDE.md`).
- **Acceptance:** Arriving at work auto-fills the start time only when the user
  hasn't set one; leaving auto-fills end time similarly; every crossing is logged
  even when times were manual.

### 7.3 Wi-Fi SSID as a location signal (alternative to GPS)
- **Files:** `src/services/` (new wifi helper), Location settings.
- **Approach:** Use the connected Wi-Fi SSID (e.g. `react-native-wifi-reborn`) as
  a cheap "am I at work?" signal where GPS is weak/indoors. Requires location
  permission on Android to read SSID — document that. Map an SSID → saved
  location.
- **Acceptance:** Connecting to a known work SSID triggers the same arrival logic
  as a geofence enter.

---

## Phase 8 – Map view (preparation)

- **Goal:** Plot the day's GPS points/tagged-content locations on a map. No
  continuous path needed.
- **Files:** new `src/screens/MapScreen.tsx`, read from `gps_track` + entries with
  lat/lng, route from Insights or day view.
- **Approach:** `react-native-maps` with the Google provider on Android (needs a
  Google Maps API key in `AndroidManifest.xml`). Render markers for GPS points
  and located entries for a selected day/range.
- **Note:** Requires a Google Maps API key + native rebuild. Confirm billing/key
  before starting.
- **Acceptance:** A selected day's located entries and GPS points appear as map
  markers.

---

## Suggested sequencing & rationale

1. **Phase 1** – fixes that bug the user daily, no native deps except gesture
   handler. Ship first.
2. **Phase 2** – settings subsections unblock later settings (Quick add,
   Location); hybrid time selector is a daily pain point.
3. **Phase 3** – "share to" is isolated; can be done any time after Phase 1.
4. **Phase 4** – faster capture (inline project create, quick add, pull-up menu);
   4.3 introduces the nav pattern used by Phase 5.
5. **Phase 5** – insights/search live in the pull-up menu from 4.3.
6. **Phase 6** – future items reshape the data model; do once capture UX is
   stable.
7. **Phase 7** – GPS automation: most permission/native risk.
8. **Phase 8** – map: needs an API key; lowest urgency.

Phases 1–3 are largely independent and could be parallelised; 4→5 and 6 are
roughly sequential; 7 and 8 are the most native-heavy and best left for last.

## Coverage check (every iteration 2 item is mapped)

- Share to → **Phase 3**
- Calendar not updating on entry → **1.1**
- Slow time selector / hybrid + clock option → **2.2**
- Settings subsections (Interface) → **2.1**
- Swipe month/day broken & out of order → **1.2**
- Per-segment hours in Today view → **1.3**
- Color-coded day split bar → **5.2**
- New nav button (Insights) → **5.1**
- Dual-function pull-up menu (300ms) → **4.3**
- Quick add (long-press FAB) + Quick-add settings → **4.2**
- New project on add-entry + searchable picker (top-3 + search) → **4.1**
- Keyboard covers input fields → **1.4**
- Future / to-do items → **6.1**
- Notification before item → **6.4**
- Next-day items on Today (Fri→Sat+Mon) → **6.2**
- Week view upcoming items → **6.3**
- Work/home location, "Currently at work" → **7.1**
- Geofence radius + auto from/to + exit logging → **7.2**
- Wi-Fi SSID alternative → **7.3**
- Map view prep → **Phase 8**

## Open decisions to confirm before building

- **Time picker:** adopt `react-native-paper-dates` (fastest path to the
  type-or-clock hybrid) vs. hand-rolled + Android `display="clock"`?
- **Notifications:** `@notifee/react-native` vs `react-native-push-notification`.
- **Charts (Insights):** `react-native-gifted-charts` vs `victory-native`.
- **Project colors:** add a `color` column to `projects` (used by 5.2 + Insights)
  vs. derive from id hash.
- **Map:** confirm a Google Maps API key / billing is available for Phase 8.
