# Day Route Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A day-scoped map screen ("my route") showing the day's GPS track as a polyline with start/end dots, the day's geotagged notes as bucketed markers, and a distance/duration stats header — reached from a button on the Selected-day screen.

**Architecture:** New `DayMapScreen` reuses the 5.4 map components (`bucketLocations`, `LocationMarker`, `MarkerNotesSheet`) plus `react-native-maps`'s built-in `<Polyline>`. A new pure `routeStats` util computes distance/duration. The existing `regionFor` is extracted to a shared util so both maps fit their region the same way.

**Tech Stack:** React Native, TypeScript, `react-native-maps@1.27.2` (no new dep), `react-native-vector-icons/MaterialCommunityIcons`, Jest, react-i18next, zustand stores.

## Global Constraints

- **No new native dependency** — JS-only; Metro reload, no rebuild/sideload.
- **Reuse, do not reinvent:** `bucketLocations`/`LocationBucket` (`src/utils/bucketLocations.ts`), `LocationMarker` (`src/components/map/LocationMarker.tsx`), `MarkerNotesSheet` (`src/components/map/MarkerNotesSheet.tsx`), `distanceMeters` (`src/services/locationUtils.ts`), `getGpsPointsForDay` (`src/db/gps.ts`), `formatDuration` (`src/utils/dateUtils.ts`).
- **Commits:** never auto-commit upstream — each task's "Commit" step does `git add` + commit locally on branch `dev` with the message shown; do not push.
- **Verify gate:** `npm run check` (lint `--max-warnings=0` + `tsc --noEmit` + jest) stays green. Map UI (screen, polyline, markers, header button) is device-verified by the user — Jest can't render the map.
- **i18n:** every visible string gets a key in BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts`.
- Tests live in `__tests__/` at repo root, importing from `../src/...`.
- Icons use `import Icon from 'react-native-vector-icons/MaterialCommunityIcons';` then `<Icon name="..." size={n} color={c} />` (see `src/navigation/CustomTabBar.tsx`).

---

### Task 1: `routeStats` util (pure, TDD)

**Files:**
- Create: `src/utils/routeStats.ts`
- Test: `__tests__/routeStats.test.ts`

**Interfaces:**
- Consumes: `distanceMeters` from `src/services/locationUtils.ts`; `GpsPoint` from `src/types`.
- Produces:
  ```ts
  export interface RouteStats { distanceM: number; durationSec: number; }
  export function routeStats(points: GpsPoint[]): RouteStats
  ```

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/routeStats.test.ts
import {routeStats} from '../src/utils/routeStats';
import type {GpsPoint} from '../src/types';

const p = (latitude: number, longitude: number, timestamp: string): GpsPoint => ({
  day_id: 1,
  latitude,
  longitude,
  accuracy: null,
  altitude: null,
  speed: null,
  timestamp,
});

describe('routeStats', () => {
  it('is zero for no points', () => {
    expect(routeStats([])).toEqual({distanceM: 0, durationSec: 0});
  });

  it('is zero for a single point', () => {
    expect(routeStats([p(60.17, 24.94, '2026-06-29T08:00:00.000Z')])).toEqual({
      distanceM: 0,
      durationSec: 0,
    });
  });

  it('measures distance and duration between two points', () => {
    const out = routeStats([
      p(60.1700, 24.9400, '2026-06-29T08:00:00.000Z'),
      p(60.1720, 24.9400, '2026-06-29T08:10:00.000Z'),
    ]);
    // ~0.002 deg latitude ≈ 222 m; allow a little slack for haversine.
    expect(out.distanceM).toBeGreaterThan(200);
    expect(out.distanceM).toBeLessThan(245);
    expect(out.durationSec).toBe(600);
  });

  it('sums consecutive legs over multiple points', () => {
    const out = routeStats([
      p(60.1700, 24.9400, '2026-06-29T08:00:00.000Z'),
      p(60.1710, 24.9400, '2026-06-29T08:05:00.000Z'),
      p(60.1720, 24.9400, '2026-06-29T08:10:00.000Z'),
    ]);
    expect(out.distanceM).toBeGreaterThan(200);
    expect(out.distanceM).toBeLessThan(245);
    expect(out.durationSec).toBe(600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest routeStats -i`
Expected: FAIL — "Cannot find module '../src/utils/routeStats'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/routeStats.ts
import {distanceMeters} from '../services/locationUtils';
import type {GpsPoint} from '../types';

export interface RouteStats {
  distanceM: number;
  durationSec: number;
}

/** Total path length (sum of consecutive legs) and elapsed time for a day's GPS track. */
export function routeStats(points: GpsPoint[]): RouteStats {
  if (points.length < 2) {
    return {distanceM: 0, durationSec: 0};
  }
  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    distanceM += distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  const start = new Date(points[0].timestamp).getTime();
  const end = new Date(points[points.length - 1].timestamp).getTime();
  return {distanceM, durationSec: Math.max(0, Math.round((end - start) / 1000))};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest routeStats -i`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/routeStats.ts __tests__/routeStats.test.ts
git commit -m "feat(map): routeStats util (distance + duration for a day track)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extract `regionFor` to a shared util

**Files:**
- Create: `src/utils/mapRegion.ts`
- Modify: `src/components/map/GalleryMap.tsx`

**Interfaces:**
- Produces: `export function regionFor(points: {latitude: number; longitude: number}[]): Region | undefined` in `src/utils/mapRegion.ts`.
- `GalleryMap.tsx` consumes it (drops its local copy). Behavior unchanged.

This is a behavior-preserving extraction so `DayMapScreen` (Task 3) can reuse it. No new test — the existing `npm run check` plus the unchanged Gallery map cover it.

- [ ] **Step 1: Create the shared util**

```ts
// src/utils/mapRegion.ts
import type {Region} from 'react-native-maps';

/** Bounding region around all points, with sane padding and minimum deltas. */
export function regionFor(points: {latitude: number; longitude: number}[]): Region | undefined {
  if (points.length === 0) {
    return undefined;
  }
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };
}
```

- [ ] **Step 2: Rewire `GalleryMap.tsx`**

In `src/components/map/GalleryMap.tsx`:
1. Delete the local `regionFor` function (the `/** Bounding region ... */` block and the whole `function regionFor(...) { ... }`).
2. Remove `type Region` from the `react-native-maps` import if it's now unused (it is — only `regionFor` used it). The import becomes:
   `import MapView, {PROVIDER_GOOGLE} from 'react-native-maps';`
   (Note: if Task "5.4" already removed `Marker`, keep that removal.)
3. Add: `import {regionFor} from '../../utils/mapRegion';` near the other local imports.

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: lint clean (no unused `Region` import), tsc clean, all jest suites pass (Gallery map behavior unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/utils/mapRegion.ts src/components/map/GalleryMap.tsx
git commit -m "refactor(map): extract regionFor to shared util

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `DayMapScreen` + navigation + day-screen button

**Files:**
- Create: `src/screens/DayMapScreen.tsx`
- Modify: `src/navigation/navigationTypes.ts`, `src/navigation/HomeStack.tsx`, `src/screens/DayScreen.tsx`, `src/i18n/locales/en.ts`, `src/i18n/locales/fi.ts`

**Interfaces:**
- Consumes: `routeStats` (Task 1), `regionFor` (Task 2), `bucketLocations`/`LocationBucket`, `LocationMarker`, `MarkerNotesSheet`, `getGpsPointsForDay`, `useEntryStore`, `formatDuration`.
- New route: `DayMap: {dayId: number; date: string}` on `HomeStackParamList`.

- [ ] **Step 1: Add the route type**

In `src/navigation/navigationTypes.ts`, add to `HomeStackParamList`:
```ts
export type HomeStackParamList = {
  HomeMain: undefined;
  DayScreen: {date: string};
  DayMap: {dayId: number; date: string};
};
```

- [ ] **Step 2: Add i18n keys (en + fi)**

In `src/i18n/locales/en.ts`, add a new top-level block (place it near `gallery`):
```ts
  dayMap: {
    title: 'Route',
    empty: 'Nothing tracked this day.',
    distance: 'Distance',
    duration: 'Duration',
  },
```
In `src/i18n/locales/fi.ts`, the matching block:
```ts
  dayMap: {
    title: 'Reitti',
    empty: 'Tältä päivältä ei ole tallennettua reittiä.',
    distance: 'Matka',
    duration: 'Kesto',
  },
```

- [ ] **Step 3: Create `src/screens/DayMapScreen.tsx`**

```tsx
import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import MapView, {Polyline, Marker, PROVIDER_GOOGLE} from 'react-native-maps';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import {useEntryStore} from '../store/entryStore';
import {getGpsPointsForDay} from '../db/gps';
import {bucketLocations, type LocationBucket} from '../utils/bucketLocations';
import {regionFor} from '../utils/mapRegion';
import {routeStats} from '../utils/routeStats';
import {formatDuration} from '../utils/dateUtils';
import LocationMarker from '../components/map/LocationMarker';
import MarkerNotesSheet from '../components/map/MarkerNotesSheet';
import type {GpsPoint, Entry} from '../types';
import type {HomeStackScreenProps} from '../navigation/navigationTypes';

type Props = HomeStackScreenProps<'DayMap'>;

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    map: {flex: 1},
    stats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    statText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    dot: {width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff'},
    startDot: {backgroundColor: '#2e9e4f'},
    endDot: {backgroundColor: '#d23b3b'},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm, backgroundColor: c.bg},
    emptyIcon: {fontSize: 44},
    emptyText: {color: c.textMuted, fontSize: typography.sizes.base, textAlign: 'center'},
  });

export default function DayMapScreen({navigation, route}: Props) {
  const {dayId} = route.params;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [openBucket, setOpenBucket] = useState<LocationBucket | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadEntriesForDay(dayId);
      getGpsPointsForDay(dayId)
        .then(p => { if (active) { setPoints(p); } })
        .catch(() => {});
      return () => { active = false; };
    }, [dayId, loadEntriesForDay]),
  );

  const entries = entriesByDay[dayId] ?? [];
  const located = useMemo(
    () => entries.filter(e => e.latitude != null && e.longitude != null),
    [entries],
  );
  const buckets = useMemo(() => bucketLocations(located, 50), [located]);
  const routeCoords = useMemo(
    () => points.map(p => ({latitude: p.latitude, longitude: p.longitude})),
    [points],
  );
  const region = useMemo(
    () =>
      regionFor([
        ...routeCoords,
        ...buckets.map(b => ({latitude: b.latitude, longitude: b.longitude})),
      ]),
    [routeCoords, buckets],
  );
  const stats = useMemo(() => routeStats(points), [points]);

  const openEntry = (entry: Entry) =>
    navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId});

  if (routeCoords.length === 0 && buckets.length === 0) {
    return (
      <SafeAreaView style={styles.empty} edges={['bottom']}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyText}>{t('dayMap.empty')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {points.length > 0 && (
        <View style={styles.stats}>
          <Text style={styles.statText}>
            {t('dayMap.distance')}: {formatDistance(stats.distanceM)}
          </Text>
          <Text style={styles.statText}>
            {t('dayMap.duration')}: {formatDuration(stats.durationSec)}
          </Text>
        </View>
      )}
      <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region}>
        {routeCoords.length >= 2 && (
          <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />
        )}
        {routeCoords.length > 0 && (
          <Marker coordinate={routeCoords[0]} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
            <View style={[styles.dot, styles.startDot]} />
          </Marker>
        )}
        {routeCoords.length >= 2 && (
          <Marker
            coordinate={routeCoords[routeCoords.length - 1]}
            anchor={{x: 0.5, y: 0.5}}
            tracksViewChanges={false}>
            <View style={[styles.dot, styles.endDot]} />
          </Marker>
        )}
        {buckets.map(bucket => (
          <LocationMarker
            key={bucket.entries[0].id}
            bucket={bucket}
            onPress={() =>
              bucket.entries.length === 1 ? openEntry(bucket.entries[0]) : setOpenBucket(bucket)
            }
          />
        ))}
      </MapView>
      <MarkerNotesSheet
        entries={openBucket?.entries ?? null}
        onSelect={openEntry}
        onClose={() => setOpenBucket(null)}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Register the screen in `HomeStack.tsx`**

In `src/navigation/HomeStack.tsx`: import the screen and the translation hook, then add a `<Stack.Screen>`. Concretely:
1. Add `import DayMapScreen from '../screens/DayMapScreen';`
2. Add `import {useTranslation} from 'react-i18next';` and inside the component `const {t} = useTranslation();` (alongside `const {colors} = useTheme();`).
3. Add after the `DayScreen` `<Stack.Screen>`:
```tsx
      <Stack.Screen
        name="DayMap"
        component={DayMapScreen}
        options={{title: t('dayMap.title')}}
      />
```

- [ ] **Step 5: Add the header button in `DayScreen.tsx`**

In `src/screens/DayScreen.tsx`:
1. Add `useLayoutEffect` to the React import: `import React, {useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect} from 'react';`
2. Add `import {TouchableOpacity} from 'react-native';` — i.e. extend the existing `react-native` import (`StyleSheet, ScrollView`) to also include `TouchableOpacity`.
3. Add `import Icon from 'react-native-vector-icons/MaterialCommunityIcons';`
4. After `const day = daysCache[currentDate];` is available, add a layout effect that installs the header button (only enabled once `day` exists):
```tsx
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        day ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('DayMap', {dayId: day.id, date: currentDate})}
            hitSlop={8}>
            <Icon name="map-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : undefined,
    });
  }, [navigation, day, currentDate, colors.primary]);
```

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: lint clean (no unused imports), tsc clean (route param types line up — `DayMap` known to `HomeStackParamList`, `EntryDetailScreen` reachable via the composite `HomeStackScreenProps`), all jest suites pass (13 suites now, incl. routeStats).

- [ ] **Step 7: Device verification (user)**

Metro reload (no rebuild). Open a day (Home → a day) → tap the new map button top-right. Confirm:
- a day with GPS points shows the route polyline + green start / red end dots + a distance/duration header;
- that day's geotagged notes appear as the 5.4 circle markers (incl. voice/text notes as glyph markers); tap → opens the note (sheet first if several share a spot);
- a day with no track but with geotagged notes shows just the markers (no header);
- a day with neither shows the "nothing tracked this day" message.

- [ ] **Step 8: Commit**

```bash
git add src/screens/DayMapScreen.tsx src/navigation/navigationTypes.ts src/navigation/HomeStack.tsx src/screens/DayScreen.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts
git commit -m "feat(map): day route map screen with stats + note markers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** route polyline + start/end dots ✓ (Task 3); day notes as bucketed markers incl. voice/text ✓; stats header (distance+duration via routeStats) ✓ (Tasks 1+3); shared regionFor ✓ (Task 2); entry button on day header → DayMapScreen ✓ (Task 3 steps 4-5); empty states ✓; no new native dep ✓; work-hours limit + widget out ✓.
- **Placeholders:** none — all code complete.
- **Type consistency:** `RouteStats {distanceM, durationSec}` (Task 1) used in Task 3 stats header; `regionFor(points)` signature identical Task 2 ↔ Task 3; `LocationBucket`/`bucketLocations`/`LocationMarker`/`MarkerNotesSheet` reused with the same shapes as iteration 5.4; `DayMap: {dayId, date}` param matches the `navigation.navigate('DayMap', {dayId, date})` call and `HomeStackScreenProps<'DayMap'>`.
