# Map Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gallery map's stacked default-pin markers with location-bucketed custom markers that open a thumbnail list of the notes at that spot.

**Architecture:** A pure `bucketLocations` util groups geotagged entries within ~50 m into one bucket (greedy single pass over the existing newest-first list). `GalleryMap` renders one custom `LocationMarker` (circle + point-down triangle + thumbnail + `+N` badge) per bucket; tapping a single-note bucket opens detail, a multi-note bucket opens `MarkerNotesSheet`.

**Tech Stack:** React Native, TypeScript, `react-native-maps@1.27.2` (PROVIDER_GOOGLE, no new native dep), Jest, react-i18next.

## Global Constraints

- **No new native dependency** — JS-only changes; a Metro reload suffices, no rebuild/sideload.
- **Bucket radius:** 50 m, via `distanceMeters` from `src/services/locationUtils.ts`.
- **Commits:** never auto-commit. The "Commit" step means: `git add` the listed files, present the suggested message, and let the user (Tommi) run the commit. Do not push.
- **Verify gate:** `npm run check` (lint + `tsc --noEmit` + jest) must stay green. Marker/sheet UI is device-verified by the user — Jest cannot render the map.
- **i18n:** every new visible string gets a key in BOTH `src/i18n/locales/en.ts` and `src/i18n/locales/fi.ts`.
- Tests live in `__tests__/` at repo root, importing from `../src/...` (see `__tests__/entrySort.test.ts`).

---

### Task 1: `bucketLocations` util (pure, TDD)

**Files:**
- Create: `src/utils/bucketLocations.ts`
- Test: `__tests__/bucketLocations.test.ts`

**Interfaces:**
- Consumes: `distanceMeters(lat1, lon1, lat2, lon2): number` from `src/services/locationUtils.ts`; `Entry` from `src/types`.
- Produces:
  ```ts
  export interface LocationBucket { latitude: number; longitude: number; entries: Entry[]; }
  export function bucketLocations(entries: Entry[], radiusM?: number): LocationBucket[]
  ```

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/bucketLocations.test.ts
import {bucketLocations} from '../src/utils/bucketLocations';
import type {Entry} from '../src/types';

const e = (id: number, latitude: number | null, longitude: number | null): Entry =>
  ({
    id,
    day_id: 1,
    entry_type: 'photo',
    activity_type: 'work',
    project_id: null,
    title: null,
    body: null,
    file_path: null,
    thumbnail_path: null,
    duration_sec: null,
    time_from: null,
    time_to: null,
    latitude,
    longitude,
    location_label: null,
    is_todo: false,
    scheduled_date: null,
    completed_at: null,
    reminder_at: null,
    created_at: '',
    updated_at: '',
  } as Entry);

// ~0.0003 deg latitude ≈ 33 m; ~0.001 deg ≈ 111 m.
describe('bucketLocations', () => {
  it('returns nothing for no entries', () => {
    expect(bucketLocations([])).toEqual([]);
  });

  it('skips entries missing coordinates', () => {
    expect(bucketLocations([e(1, null, null), e(2, 60.17, null)])).toEqual([]);
  });

  it('merges two points within 50 m into one bucket', () => {
    const out = bucketLocations([e(1, 60.1700, 24.9400), e(2, 60.1702, 24.9400)], 50);
    expect(out).toHaveLength(1);
    expect(out[0].entries.map(x => x.id)).toEqual([1, 2]);
  });

  it('keeps points more than 50 m apart in separate buckets', () => {
    const out = bucketLocations([e(1, 60.1700, 24.9400), e(2, 60.1720, 24.9400)], 50);
    expect(out).toHaveLength(2);
  });

  it('anchors the bucket at the first entry and preserves input order', () => {
    const out = bucketLocations(
      [e(1, 60.1700, 24.9400), e(2, 60.1750, 24.9400), e(3, 60.1701, 24.9400)],
      50,
    );
    expect(out).toHaveLength(2);
    expect(out[0].latitude).toBe(60.17);
    expect(out[0].entries.map(x => x.id)).toEqual([1, 3]);
    expect(out[1].entries.map(x => x.id)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest bucketLocations -i`
Expected: FAIL — "Cannot find module '../src/utils/bucketLocations'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/bucketLocations.ts
import {distanceMeters} from '../services/locationUtils';
import type {Entry} from '../types';

export interface LocationBucket {
  latitude: number;
  longitude: number;
  entries: Entry[];
}

/**
 * Group geotagged entries into buckets of co-located notes. Greedy single pass:
 * each entry joins the first existing bucket whose anchor is within `radiusM`,
 * else starts a new bucket anchored at its own coordinates. Input order is
 * preserved (callers pass newest-first).
 */
export function bucketLocations(entries: Entry[], radiusM = 50): LocationBucket[] {
  const buckets: LocationBucket[] = [];
  for (const entry of entries) {
    if (entry.latitude == null || entry.longitude == null) {
      continue;
    }
    const hit = buckets.find(
      b => distanceMeters(b.latitude, b.longitude, entry.latitude!, entry.longitude!) <= radiusM,
    );
    if (hit) {
      hit.entries.push(entry);
    } else {
      buckets.push({latitude: entry.latitude, longitude: entry.longitude, entries: [entry]});
    }
  }
  return buckets;
}
// ponytail: greedy O(n·buckets), fine for ≤1000 pts; add a grid index if it janks.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest bucketLocations -i`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/bucketLocations.ts __tests__/bucketLocations.test.ts
# suggested message — user commits:
# feat(map): location-bucketing util for co-located notes
```

---

### Task 2: `LocationMarker` custom marker

**Files:**
- Create: `src/components/map/LocationMarker.tsx`
- Modify: `src/utils/mediaUtils.ts` (add `firstVisualMedia` helper)

**Interfaces:**
- Consumes: `LocationBucket` from `src/utils/bucketLocations`; `fileUri` and new `firstVisualMedia` from `src/utils/mediaUtils`; `Marker` from `react-native-maps`; `useTheme`/`spacing`/`radius`/`typography` from `src/theme`.
- Produces:
  ```ts
  // src/utils/mediaUtils.ts
  export function firstVisualMedia(entry: Entry): EntryMedia | undefined
  // src/components/map/LocationMarker.tsx (default export)
  export default function LocationMarker(props: {
    bucket: LocationBucket;
    onPress: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Add the `firstVisualMedia` helper**

Add to `src/utils/mediaUtils.ts` (import `Entry`, `EntryMedia` from `../types` if not already imported):

```ts
/** Lowest-position photo or video attachment on an entry, if any. */
export function firstVisualMedia(entry: Entry): EntryMedia | undefined {
  return (entry.media ?? [])
    .filter(m => m.media_type === 'photo' || m.media_type === 'video')
    .sort((a, b) => a.position - b.position)[0];
}
```

- [ ] **Step 2: Write the marker component**

```tsx
// src/components/map/LocationMarker.tsx
import React, {useMemo, useState} from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {Marker} from 'react-native-maps';
import {useTheme, typography, radius} from '../../theme';
import type {Colors} from '../../theme';
import {fileUri, firstVisualMedia} from '../../utils/mediaUtils';
import type {LocationBucket} from '../../utils/bucketLocations';

interface Props {
  bucket: LocationBucket;
  onPress: () => void;
}

const SIZE = 48;
const TRI = 8; // triangle half-width / height

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {alignItems: 'center'},
    circle: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: c.bgCard,
      borderWidth: 3,
      borderColor: c.primary,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: {width: SIZE, height: SIZE},
    glyph: {fontSize: 22},
    triangle: {
      width: 0,
      height: 0,
      borderLeftWidth: TRI,
      borderRightWidth: TRI,
      borderTopWidth: TRI,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.primary,
      marginTop: -1,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 4,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {color: '#fff', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold},
  });

export default function LocationMarker({bucket, onPress}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const newest = bucket.entries[0];
  const media = firstVisualMedia(newest);
  const uri = media ? fileUri(media.thumbnail_path || media.file_path) : null;
  const count = bucket.entries.length;

  // tracksViewChanges must go false once the view is stable, or the map janks
  // on Android (re-renders every marker every frame). No image → stable at mount.
  const [track, setTrack] = useState<boolean>(uri != null);

  return (
    <Marker
      coordinate={{latitude: bucket.latitude, longitude: bucket.longitude}}
      onPress={onPress}
      tracksViewChanges={track}
      anchor={{x: 0.5, y: 1}}>
      <View style={styles.wrap}>
        <View style={styles.circle}>
          {uri ? (
            <Image
              source={{uri}}
              style={styles.image}
              onLoad={() => setTrack(false)}
              onError={() => setTrack(false)}
            />
          ) : (
            <Text style={styles.glyph}>{media?.media_type === 'video' ? '🎥' : '📝'}</Text>
          )}
        </View>
        <View style={styles.triangle} />
        {count > 1 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). No unit test — UI is device-verified.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/LocationMarker.tsx src/utils/mediaUtils.ts
# suggested message — user commits:
# feat(map): custom circle+triangle marker with +N badge
```

---

### Task 3: `MarkerNotesSheet` thumbnail list

**Files:**
- Create: `src/components/map/MarkerNotesSheet.tsx`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/fi.ts`

**Interfaces:**
- Consumes: `Entry` from `src/types`; `fileUri`/`firstVisualMedia` from `src/utils/mediaUtils`; `formatTime` from `src/utils/dateUtils`; `useTheme`/tokens from `src/theme`; `t('gallery.notesHere')`.
- Produces:
  ```ts
  export default function MarkerNotesSheet(props: {
    entries: Entry[] | null;   // null = hidden
    onSelect: (entry: Entry) => void;
    onClose: () => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Add i18n key**

In `src/i18n/locales/en.ts`, inside the `gallery: { … }` block (after `noLocations`):
```ts
    notesHere: 'Notes here',
```
In `src/i18n/locales/fi.ts`, inside its `gallery` block:
```ts
    notesHere: 'Muistiinpanot täällä',
```

- [ ] **Step 2: Write the sheet component**

Mirrors `src/components/ui/ActionSheet.tsx` (RN `<Modal>` + `Pressable` backdrop — no RNGH, so no GestureHandlerRootView needed). Uses a `ScrollView` so a busy location stays scrollable.

```tsx
// src/components/map/MarkerNotesSheet.tsx
import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal, View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {fileUri, firstVisualMedia} from '../../utils/mediaUtils';
import {formatTime} from '../../utils/dateUtils';
import type {Entry} from '../../types';

interface Props {
  entries: Entry[] | null;
  onSelect: (entry: Entry) => void;
  onClose: () => void;
}

const THUMB = 44;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end'},
    sheet: {
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
      maxHeight: '70%',
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    thumb: {width: THUMB, height: THUMB, borderRadius: radius.sm, backgroundColor: c.bgMuted},
    thumbPlaceholder: {alignItems: 'center', justifyContent: 'center'},
    thumbGlyph: {fontSize: 20},
    rowText: {flex: 1},
    rowTitle: {fontSize: typography.sizes.base, color: c.textPrimary},
    rowTime: {fontSize: typography.sizes.sm, color: c.textMuted},
  });

function Thumb({entry, styles}: {entry: Entry; styles: ReturnType<typeof makeStyles>}) {
  const media = firstVisualMedia(entry);
  const uri = media ? fileUri(media.thumbnail_path || media.file_path) : null;
  if (uri) {
    return <Image source={{uri}} style={styles.thumb} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder]}>
      <Text style={styles.thumbGlyph}>{media?.media_type === 'video' ? '🎥' : '📝'}</Text>
    </View>
  );
}

export default function MarkerNotesSheet({entries, onSelect, onClose}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={entries != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('gallery.notesHere')}</Text>
          <ScrollView>
            {(entries ?? []).map(entry => (
              <TouchableOpacity
                key={entry.id}
                style={styles.row}
                onPress={() => { onClose(); onSelect(entry); }}>
                <Thumb entry={entry} styles={styles} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.title || entry.location_label || formatTime(entry.created_at)}
                  </Text>
                  <Text style={styles.rowTime}>{formatTime(entry.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. UI device-verified.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/MarkerNotesSheet.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts
# suggested message — user commits:
# feat(map): thumbnail-list sheet for notes at a location
```

---

### Task 4: Wire buckets + markers + sheet into `GalleryMap`

**Files:**
- Modify: `src/components/map/GalleryMap.tsx`

**Interfaces:**
- Consumes: `bucketLocations`/`LocationBucket` (Task 1), `LocationMarker` (Task 2), `MarkerNotesSheet` (Task 3). Existing `onSelect: (entry: Entry) => void` prop is unchanged.

- [ ] **Step 1: Replace marker rendering**

In `src/components/map/GalleryMap.tsx`:

1. Adjust the existing `import React, {useMemo} from 'react';` to add `useState`, drop the now-unused `Marker` from the `react-native-maps` import (keep `MapView`, `PROVIDER_GOOGLE`, `type Region`), and add the three new imports:
```tsx
import React, {useMemo, useState} from 'react';
import MapView, {PROVIDER_GOOGLE, type Region} from 'react-native-maps';
import {bucketLocations, type LocationBucket} from '../../utils/bucketLocations';
import LocationMarker from './LocationMarker';
import MarkerNotesSheet from './MarkerNotesSheet';
```

2. After the existing `located` memo, add buckets + sheet state:
```tsx
  const buckets = useMemo(() => bucketLocations(located, 50), [located]);
  const [openBucket, setOpenBucket] = useState<LocationBucket | null>(null);
```

3. Change `region` memo to read bucket coords (equivalent — buckets cover all located points):
```tsx
  const region = useMemo(
    () => regionFor(buckets.map(b => ({latitude: b.latitude, longitude: b.longitude}))),
    [buckets],
  );
```

4. Replace the `<MapView>…{located.map(...)}</MapView>` block with bucketed markers, and add the sheet:
```tsx
  return (
    <View style={styles.container}>
      <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region}>
        {buckets.map(bucket => (
          <LocationMarker
            key={bucket.entries[0].id}
            bucket={bucket}
            onPress={() =>
              bucket.entries.length === 1
                ? onSelect(bucket.entries[0])
                : setOpenBucket(bucket)
            }
          />
        ))}
      </MapView>
      <MarkerNotesSheet
        entries={openBucket?.entries ?? null}
        onSelect={onSelect}
        onClose={() => setOpenBucket(null)}
      />
    </View>
  );
```

Remove the now-unused `Marker` import. Keep `regionFor`, the empty-state (`located.length === 0`), and the `onSelect` prop as-is.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint -- --max-warnings=0`
Expected: PASS, no unused-import warnings (confirm `Marker` import is gone).

- [ ] **Step 3: Full check**

Run: `npm run check`
Expected: PASS — lint clean, tsc clean, all jest suites green (12 suites now, incl. bucketLocations).

- [ ] **Step 4: Device verification (user)**

On device/emulator (Metro reload — no rebuild): open Gallery → Map. Confirm:
- co-located notes collapse into one marker with a `+N` badge;
- markers show the circle + point-down triangle + thumbnail, no red pins;
- tapping a single-note marker opens its detail; tapping a multi-note marker opens the thumbnail sheet → tapping a row opens that note;
- panning/zooming stays smooth (no jank → `tracksViewChanges` flip working).

- [ ] **Step 5: Commit**

```bash
git add src/components/map/GalleryMap.tsx
# suggested message — user commits:
# feat(map): render bucketed custom markers with notes sheet
```

---

## Self-Review

- **Spec coverage:** bucketing (Task 1) ✓; 50 m radius via `distanceMeters` ✓; custom marker circle+triangle+thumbnail+badge with `tracksViewChanges` flip (Task 2) ✓; thumbnail-list sheet, single-note skips it (Task 3 + Task 4 onPress) ✓; Gallery-only, no new native dep, no route-today ✓; fallback glyph for video-without-thumb ✓.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `LocationBucket {latitude, longitude, entries}` used identically in Tasks 1–4; `firstVisualMedia(entry)` defined in Task 2, reused in Task 3; `bucketLocations(entries, 50)` signature matches Task 1.
