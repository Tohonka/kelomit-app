# Iteration 5.4 — Map rework (design)

**Date:** 2026-06-29
**Backlog:** `plans_etc/Iteration 5 - goblin time.md` lines 36-39.
**Status:** approved by user 2026-06-29.

## Problem

The Gallery map (`src/components/map/GalleryMap.tsx`) has two flaws the user wants fixed:

1. **Stacked markers** — multiple notes made at the same place render on top of each
   other. Want: co-located notes bucketed into ONE marker; tapping it shows the notes
   there.
2. **Ugly default red pins** — want a custom marker: a circle with a small point-down
   triangle and the note's image inside.

## Decisions (settled with user)

- **Bucket radius:** ~50 m ("same place").
- **Marker tap:** thumbnail-list bottom sheet for multi-note markers; single-note
  markers open detail directly.
- **Scope:** map rework only. Route-today, day-scoped map, and surfacing voice/text-only
  geotagged notes are all OUT.
- **Map location:** stays Gallery-only.
- **No new native dep** — hand-rolled JS bucketing, so changes are a pure Metro reload
  (no rebuild / sideload dance).

## Data reality

`GalleryMap` receives `items: MediaItem[]` from `getMediaEntries()`, which returns
**photo + video attachments only**. So in practice every marker has a thumbnail;
voice/text-only geotagged notes do not reach this map today (kept that way — in scope).
A fallback glyph still exists for the rare video-without-thumbnail.

Relevant fields (`src/types/index.ts`): `Entry.{id, latitude, longitude, location_label,
title, media[]}`; `EntryMedia.{media_type, file_path, thumbnail_path, position}`.

## Components

### 1. `src/utils/bucketLocations.ts` (NEW, pure, TDD)

```ts
export interface LocationBucket {
  latitude: number;
  longitude: number;
  entries: Entry[];
}
export function bucketLocations(entries: Entry[], radiusM = 50): LocationBucket[]
```

Greedy single pass, preserving input order (input is newest-first):
- Skip entries without both `latitude` and `longitude`.
- For each entry, find the first existing bucket whose anchor is within `radiusM`
  (via `distanceMeters` from `src/services/locationUtils.ts`); add it there.
- Otherwise start a new bucket anchored at the entry's coords; bucket `latitude`/
  `longitude` = the anchor entry's coords (representative point, not recomputed centroid).

`// ponytail: greedy O(n·buckets), fine for ≤1000 pts; add a grid index if it janks.`

### 2. `src/components/map/LocationMarker.tsx` (NEW)

Custom `react-native-maps` `<Marker>` whose child view is:
- a circle containing the thumbnail `<Image>` (newest entry's first photo/video
  `thumbnail_path || file_path`; fallback glyph by `media_type` when neither exists),
- a downward-pointing triangle below it (CSS border trick),
- a `+N` count badge when `bucket.entries.length > 1`.

**Perf:** start with `tracksViewChanges={true}`, flip to `false` after the image's
`onLoad` (or immediately for the glyph fallback). This is the #1 Android custom-marker
jank fix — without it the map re-renders every marker every frame.

### 3. `src/components/map/MarkerNotesSheet.tsx` (NEW)

Bottom-sheet (RN `<Modal>`, same pattern as `ui/ActionSheet`) listing a bucket's notes,
each row = thumbnail + title + time. Tap row → `onSelect(entry)`. New component because
`ActionSheet` is text-only. Has a cancel/close affordance and tap-backdrop-to-close.

### 4. `src/components/map/GalleryMap.tsx` (MODIFY)

- Replace the per-entry dedupe `located` memo with
  `bucketLocations(dedupedEntries, 50)`.
- Keep the existing entry-dedupe step first (an entry can own several media items).
- Render one `LocationMarker` per bucket.
- `regionFor` runs on bucket coords.
- Marker press: `bucket.entries.length === 1` → `onSelect(entries[0])`;
  else open `MarkerNotesSheet` for that bucket.

## Data flow

```
items (photo+video MediaItem[], newest-first)
  → dedupe to one Entry per id (existing loop)
  → bucketLocations(entries, 50)
  → LocationBucket[]
  → one LocationMarker each; regionFor(bucket coords)
  → tap: 1 note → onSelect; >1 → MarkerNotesSheet → onSelect
```

`onSelect` is unchanged — `GalleryScreen` opens `GalleryDetailModal` with the entry's
first photo.

## Testing

- **`bucketLocations`** — Jest, TDD (failing test first). Matches how `entrySort` /
  `usualHours` / `hoursUtils` are tested. Cases: empty; entries missing coords; two
  points within 50 m → one bucket; two points >50 m apart → two buckets; order
  preserved; a third point near an existing bucket's anchor joins it.
- **Markers / sheet** — device-verified (Jest can't render the map).

## Gotchas carried in

- `react-native-maps` custom marker → `tracksViewChanges={false}` after load (above).
- RNGH gestures inside RN `<Modal>` need a local `GestureHandlerRootView` — only if the
  sheet uses RNGH (plain `Pressable` like `ActionSheet` avoids this).
- No new native dep ⇒ no rebuild / sideload needed.
