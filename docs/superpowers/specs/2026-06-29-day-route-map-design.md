# Iteration 5.4b — "My route today" day-scoped map (design)

**Date:** 2026-06-29
**Backlog:** `plans_etc/Iteration 5 - goblin time.md` lines 64-67 (GPS).
**Status:** approved by user 2026-06-29 (with stats header in).

## Problem

Continuous GPS tracking already records per-day points to `gps_track`, but there's no
way to see them. Backlog wants a fitness-app-style "my route today": the day's route as
a polyline with the day's notes plotted on it. Optional; combined with the map view.

## Decisions (settled with user)

- **Entry point:** a map/route button on the Selected-day screen header → a new
  `DayMapScreen` for the day being viewed (works for today and any past day).
- **Stats header:** IN — total distance + time span for the day.
- **Out of scope:** work-hours recording limit (deferred — tracking is already opt-in;
  see `kelomit-single-user-defer-privacy`), stop-tracking widget (native, deferred).
- **No new native dependency** — `react-native-maps` already ships `<Polyline>`; reuse
  the 5.4 map components. JS-only ⇒ Metro reload, no rebuild.

## Reuse (from iteration 5.4)

- `bucketLocations(entries, 50)` / `LocationBucket` — `src/utils/bucketLocations.ts`
- `LocationMarker` — `src/components/map/LocationMarker.tsx`
- `MarkerNotesSheet` — `src/components/map/MarkerNotesSheet.tsx`
- `distanceMeters` — `src/services/locationUtils.ts`
- `getGpsPointsForDay(dayId)` → `GpsPoint[]` (ordered by timestamp ASC) — `src/db/gps.ts`

Unlike the Gallery map (media entries only), the day screen holds full `Entry[]`, so the
day map plots **all** geotagged notes — voice/text included (glyph fallback in
`LocationMarker`).

## Components

### 1. `src/utils/routeStats.ts` (NEW, pure, TDD)

```ts
import type {GpsPoint} from '../types';
export interface RouteStats { distanceM: number; durationSec: number; }
export function routeStats(points: GpsPoint[]): RouteStats
```

- `distanceM` = sum of `distanceMeters` over consecutive points (0 for <2 points).
- `durationSec` = seconds between first and last `timestamp` (ISO strings; 0 for <2 points).

### 2. `src/utils/mapRegion.ts` (NEW — extracted, not new logic)

Move the existing private `regionFor(points): Region | undefined` out of
`GalleryMap.tsx` into this file and export it. `GalleryMap.tsx` imports it instead of
its local copy (behavior unchanged). `DayMapScreen` reuses it, fitting region to the
combined route + note coordinates.

### 3. `src/screens/DayMapScreen.tsx` (NEW)

Route params: `{dayId: number; date: string}`. On focus, loads:
- **Route:** `getGpsPointsForDay(dayId)` → `<Polyline coordinates={...} strokeColor={primary} strokeWidth={4} />`, plus small **start** (green dot) and **end** (red dot) `<Marker>`s at the first/last point.
- **Notes:** that day's entries from `useEntryStore` (`loadEntriesForDay(dayId)` then `entriesByDay[dayId]`), filtered to those with `latitude/longitude` → `bucketLocations` → `LocationMarker`s. Tap single-note bucket → `navigation.navigate('EntryDetailScreen', {entryId, dayId})`; tap multi-note bucket → `MarkerNotesSheet` → same nav on row select.
- **Region:** `regionFor([...routeCoords, ...noteCoords])` as `initialRegion`.
- **Stats header:** a thin bar over the map showing `routeStats` — distance (km when ≥1000 m, else m) + duration via `formatDuration` (from `dateUtils`). Hidden when no route points.
- **Empty states:** no route AND no notes → centered message ("nothing tracked this day"). No route but notes → markers only (no polyline/stats). No notes but route → polyline only.

### 4. Navigation + entry button

- `HomeStackParamList` (`src/navigation/navigationTypes.ts`) += `DayMap: {dayId: number; date: string}`.
- `HomeStack.tsx` registers `<Stack.Screen name="DayMap" component={DayMapScreen} options={{title: t('dayMap.title')}} />`. (DayScreen lives only in HomeStack, which has a native header — so the button and the new screen both sit here.)
- `DayScreen.tsx`: `useLayoutEffect` calls `navigation.setOptions({ headerRight })` rendering a map button that navigates to `DayMap` with `{dayId: day.id, date: currentDate}`. Button disabled/absent until `day` is loaded.

### 5. i18n (en + fi)

`dayMap.title` ("Route" / "Reitti"), `dayMap.empty` ("Nothing tracked this day." / Finnish),
`dayMap.distance` ("Distance" / "Matka"), `dayMap.duration` ("Duration" / "Kesto").

## Testing

- **`routeStats`** — Jest, TDD: empty → {0,0}; one point → {0,0}; two known points → known distance + duration; multi-point sums consecutive legs.
- **`mapRegion`** — covered indirectly; extraction is behavior-preserving (existing Gallery map still works). No new test required (pure move).
- **`DayMapScreen` / Polyline / markers** — device-verified (Jest can't render the map).

## Gotchas carried in

- `react-native-maps` custom markers → `tracksViewChanges={false}` after load (handled in `LocationMarker`; the start/end dots are static views, so set `tracksViewChanges={false}` on them too).
- Route only has data if continuous tracking was on that day — expected; empty-state covers it.
- Outlier rejection already runs at record time, so the polyline shouldn't show wild jumps.
