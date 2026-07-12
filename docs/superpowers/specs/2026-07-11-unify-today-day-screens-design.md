# Unify Today / Day screens + fix entrypoint routing

**Date:** 2026-07-11
**Branch:** `redesign/ui-visuals`
**Status:** Approved design, ready for planning

## Problem

`HomeScreen` (Today tab) and `DayScreen` (a specific day) are ~80% identical —
same summary card, split bar, entry list, and day note — but exist as two
separate screens with duplicated content and diverging chrome. The braindump
(`plans_etc/sidequest_UI-refresh.md`) wants them unified into one uniform
"day is a day" screen.

Separately, **back navigation is buggy**: tapping a day in the Calendar pushes
`DayScreen` *inside the Home tab's nested stack*, so pressing Back returns to
**Today**, not the Calendar you came from. The user wants "back returns me where
I was" (Calendar→day→back = Calendar; Today→swipe→day→back = Today).

## Root cause of the routing bug

The day detail is pushed on the **Home tab's nested stack** (`HomeStack`), not
the root stack. A nested push can only pop back to that tab's root (Today). The
fix is to push the day detail on the **root stack** — popping it then reveals
`MainTabs` with whatever tab was active when the push happened (Calendar or
Today). The navigation stack does the "entrypoint memory" for free; no manual
`cameFrom` state.

## Approach (chosen: A)

One shared body component rendered in two contexts, with the day detail moved to
the root stack.

### Component structure

- **`DayView`** — new, `src/components/day/DayView.tsx`. The shared day body,
  and the owner of the **ScrollView** (so swipe + keyboard-lift live in one place).
  - Props: `date: string`, `variant: 'today' | 'detail'`, `onRequestDate: (date: string) => void`, `onOpenEntry: (entry) => void`, `onDayLoaded?: (day: Day | null) => void`.
  - Loads its `date`'s day + entries (`loadDay` / `loadEntriesForDay`), computes the day's project/tag filter lists, owns the project/tag filter state, and renders the shared content: `FilterBar`, `DaySummaryCard`, `DaySplitBar`, `EntryList` (card variant), `SpecialNoteCard`.
  - Owns the **header and scroll padding per variant**: `today` renders the big
    in-scroll header (weekday title + hours readout + date subtitle) and pads the
    scroll with `useShellPadding` to clear the floating bars; `detail` renders no
    in-scroll header (the native stack header covers it) and pads for the native
    header top + FAB/bottom clearance.
  - Owns the prev/next-day **swipe** gesture. On swipe it computes the target date and calls `onRequestDate(target)` — the wrapper decides what that means (Today pushes a detail route; detail changes date in place). `variant` gates direction: `today` fires only for the previous day (today is the end of the line); `detail` fires both directions.
  - When `variant === 'today'`, additionally renders the **today-only extras** in the correct scroll positions: quick-timer card (already shows only when a session is active), day-end confirm banner, "coming up" to-dos, and the geofence "where am I" line. These carry their own data effects, guarded by the variant. Also preserves the `AppState`-foreground `loadDay(today)` refresh (midnight rollover / background geofence stamps).
  - Calls `onDayLoaded(day)` when the day resolves, so a wrapper can wire header
    actions that need `day.id` (e.g. the detail map button).

- **`HomeScreen`** (Today tab) — very thin. Supplies today's date and the push
  callback: `<DayView variant="today" date={todayDate()} onRequestDate={d => navigation.push('DayScreen', {date: d})} onOpenEntry={…} />`. No header or padding of its own — `DayView` owns those.

- **`DayScreen`** (root route) — thin. Holds `date` in local state (initialised
  from `route.params.date`); sets the native header (title = formatted date, back
  button, `headerRight` = map icon that navigates to `DayMap` using the `day.id`
  from `onDayLoaded`); renders `<DayView variant="detail" date={date} onRequestDate={setDate} onDayLoaded={setDay} … />` and the `FAB` (full add + quick-add dial for that day).
  - **Hours readout:** shown via the shared `DaySummaryCard` (which already
    displays the day total) on both variants. The detail native header drops its
    separate hours readout — one less piece of DayView→wrapper plumbing, and the
    number is still visible in the card.

### Routing & navigation changes

- Register **`DayScreen` and `DayMap` on the root stack** (`RootNavigator`).
  `DayScreen` navigates to `DayMap`, so `DayMap` must be reachable from the root
  once `DayScreen` is a root screen. (`MapTab` already uses `DayMapView` directly
  and is unaffected.)
- **Remove `DayScreen` and `DayMap` from `HomeStack`.** `HomeStack` then contains
  only `HomeMain`, so **delete `HomeStack`** entirely — the Home tab in
  `MainTabs` renders `HomeScreen` directly.
- Update param-list types: move `DayScreen` (`{date}`) and `DayMap`
  (`{dayId, date}`) into `RootStackParamList`; drop `HomeStackParamList`.
  `HomeScreen`/`DayScreen`/`DayMapScreen` prop types switch from
  `HomeStackScreenProps<…>` to `RootStackScreenProps<…>` / `TabScreenProps<'Home'>`.
- `CalendarScreen`: change `navigate('Home', {screen: 'DayScreen', params})` →
  `navigate('DayScreen', {date})`.
- Today swipe-right: `navigation.push('DayScreen', {date: shiftDate(today, -1)})`.
- **`NavShell`**: remove the "hide the bars when the Home nested stack is on a
  detail screen" logic — the Home tab no longer has a nested stack, and day detail
  is a root push that already covers the bars.

### What is shared vs today-only

- **All days:** FilterBar, summary card (editable start/end times), split bar,
  entry-list card, day note.
- **Today only:** quick-timer (when running), day-end confirm banner, coming-up
  to-dos, geofence "where am I" line.
- **Chrome:** detail = native header (back + map) + FAB, hours via the summary
  card; today = floating bars + in-scroll header, quick-add via the pill.

## Out of scope (explicit)

- The project/tag **filter redesign** (narrower / search-field instead of chips) —
  a separate follow-up. The existing `FilterBar` is reused as-is on the unified
  screen.
- Moving Search to the day header.
- Any change to the entry list rows, insights, gallery, or map beyond what the
  unification requires.

## Verification

Mostly wiring — no new pure-logic units to unit-test. Verify on device:
1. Calendar → tap a day → Back returns to **Calendar** (scroll position intact).
2. Today → swipe right → day → Back returns to **Today**.
3. Android **hardware back** matches the gesture behaviour in both cases.
4. Swiping within a detail day changes the date in place, but Back still returns
   to the original entry point (not each swiped day).
5. Today-only extras appear only on today; past/future days show just the shared
   content.
6. FilterBar works on both today and detail days.
7. `tsc --noEmit`, `eslint`, and the Android JS bundle are all clean.

## Risks / notes

- **`today` store field vs `daysCache[today]`:** `HomeScreen` currently reads the
  `today` field (refreshed on `AppState` foreground for midnight rollover /
  background geofence stamps). `DayView` will load via `loadDay(date)` /
  `daysCache[date]`. The Today variant must preserve the AppState-foreground
  refresh so the rollover and background-stamp behaviour is not lost. The plan
  must handle this explicitly.
- `DayView` is the one large new file; keep it focused on "render + load one day".
  The two wrappers stay thin.
