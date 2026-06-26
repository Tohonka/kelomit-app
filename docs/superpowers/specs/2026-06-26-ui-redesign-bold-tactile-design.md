# Kelomit UI Redesign — "Bold & Tactile" (Direction C)

**Date:** 2026-06-26
**Status:** Design approved, ready for implementation plan
**Scope:** Visual + interaction overhaul of the three most-used surfaces (Home, Quick Add,
Day screen), built on a new shared animation foundation.

## Intent

The app's UI has been practical but inert — nothing responds, breathes, or rewards. This
redesign makes it *feel* good: exaggerated-but-fast spring physics, bold typography, and a
small celebration on every save. The driving constraint is the user's severe ADHD — constant
small rewards keep them in the app, and the most-used flow (adding a note) must lose friction,
not gain it.

The existing warm cream / burnt-orange palette is kept as-is; this is about motion, weight,
and feedback, not recoloring. Theme-switching is explicitly a later phase.

## Personality direction

**C — Bold & tactile.** Bigger typography, stronger color blocks, exaggerated bounce
animations, dopamine-optimized feedback. Every save is a little celebration. A game UI that
takes itself seriously — not a flat productivity app, not dark-glass premium.

## Technical foundation

- **`react-native-reanimated` is added** (one new dependency, requires a native rebuild).
  Decision rationale: the "exaggerated bounce + every save celebrates" feel needs spring
  animations on the UI thread, not the JS thread — otherwise animations stutter the moment
  the JS thread is busy (SQLite writes, entry loads). Android is the primary near-term
  platform; the new-arch + Hermes setup handles reanimated cleanly.
- Bottom sheet is **built in-house** on reanimated + the already-installed
  `react-native-gesture-handler` (~80 lines), NOT `@gorhom/bottom-sheet`. Keeps the dep
  count at +1. Revisit @gorhom only if sheets proliferate to multiple screens later.
- No haptics library — keep using core `Vibration`, but switch from single pulses to
  short *patterns*.

## Foundation — new shared pieces

These are built first; the screens consume them.

### Type scale
- Add `black: '900'` weight to `typography.weights` in `src/theme/index.ts`.
- Apply black weight to: running timer clock, day date header, hour/day totals, entry titles.
- General rule: most text bumps one weight step up (section labels semibold→bold).

### `usePressAnimation()` hook + `<Bounceable>` wrapper
- A reanimated `useAnimatedStyle` press-scale hook (~15 lines): `pressIn` → scale `0.94`
  (spring: stiff, low damping); `pressOut` → overshoot `1.04`, settle to `1.0`.
- `<Bounceable>` (~20 lines) wraps the hook + a `Pressable` so screens don't scatter-gun the
  hook. **Every** tappable migrates from `TouchableOpacity` to this: buttons, list items,
  chips, FAB, badges.

### `<CountUp>` animated number
- Animates a numeric value from 0 → target over ~600ms on mount/change.
- Used for every total: Home day-total, day-screen totals, hour breakdowns.

### Cards & pills
- Cards lose `borderWidth: 1 / borderColor`; rely on stronger background differentiation
  (`bgCard` vs `bg`) instead.
- Activity badges go from outline pills to **solid-color** pills (using `badgeWork` /
  `badgePersonalWork` / `badgePersonal` as fills).

### Haptics
- Replace `Vibration.vibrate(40)` with patterns:
  - Save: `Vibration.vibrate([0, 35, 15, 55])` (short double-tap).
  - Timer start: single pulse (unchanged feel).
  - Cancel / delete: a longer buzz.

## Home screen

Layout order is unchanged; all changes are feel.

- **Header:** date → black weight, larger. Day-total in the corner uses `<CountUp>` (counts
  up from 0 on mount when >0).
- **Timer card (centerpiece):**
  - *Idle:* solid card, full-width "Start" that bounces on press.
  - *Running:* card **inverts** to solid `primary` with white text; 72px black-weight clock
    centered (up from 44px/bold). A **breathing glow ring** pulses around the card
    (~2s loop, opacity 0.3 ↔ 0.6) as a passive "this is live" signal visible from a
    distance. Stop button white-on-primary, bounces.
  - idle→running transition springs the card scale (0.96 overshoot → 1.0), not a hard swap.
- **Entry list items:** `<Bounceable>` press. New entries animate in with
  `entering={SlideInLeft.springify()}` so a freshly-saved note announces itself. Lead
  thumbnail/icon (44px) gets the press-scale too.
- **FAB:** 64px (up from 58px), subtle glow ring (`primary` @ ~30% opacity, gently pulsing).
  On long-press the dial actions **stagger in** (each ~40ms after the previous) instead of
  appearing at once. The "+" rotates 45° → "×" when the dial is expanded.

## Quick Add — the bottom sheet (path A)

The flow flagged as having the most daily edges. **Path A chosen:** the sheet is the quick
*note* path only. Photo / voice / full-editor (`AddEntryModal`) keep their existing screens,
and the FAB long-press dial is unchanged. (Path B — a single-tap quick-add hub with type
chips — was deferred; the user has an unformed idea for quick-add and chose the safer scope.)

**Replaces:** the current FAB→dial→navigation push to `QuickAddModal` (full-screen, slides
from right) — for the quick-*note* path only.

### `<QuickAddSheet>` (new component, mounted at the Home level)
- reanimated-driven panel anchored to the bottom. A `translateY` shared value: `0` = open,
  `screenHeight` = closed.
- Opens with a spring (damping ~18, stiffness ~180 — fast, with a small overshoot so it
  "lands").
- **Backdrop** fades opacity `0 → 0.5`, *derived from the same `translateY`* so drag-to-dismiss
  dims proportionally (physically linked, not two separate animations).
- **Drag-to-dismiss:** `Gesture.Pan()` on the grab-handle. Drag past 1/3 height or fling →
  spring out + close. Release above threshold → spring back to open.
- **Keyboard-aware:** sheet translates up by keyboard height via core `Keyboard` events
  (no extra dep).
- **Auto-focus:** opens with the title input focused + keyboard up in one motion — the single
  biggest friction kill.

### Sheet contents
Same fields as the current `QuickAddModal`: attachments section, title, duration. The defaults
note ("Work · #tag") stays as the at-a-glance confirmation.

### Save celebration (the C payoff)
1. Save button bounces on press.
2. Sheet springs *down and out*.
3. Double-tap haptic fires (`[0, 35, 15, 55]`).
4. The new entry slides into the list behind the leaving sheet (the `SlideInLeft` entrance) —
   the sheet departing *reveals* the note already sitting there. Reads as causal.
- `isSaving` shows a brief loading pulse on the button; SQLite writes are fast enough this is
  usually just a flash.

## Day screen (browsing past days)

Lightest touch — a review surface, not an input one.

- **Inherits free:** bounce press states, `<CountUp>` totals, solid pills, borderless cards —
  all from the shared components, zero per-screen work.
- **Day swipe polish:** the existing prev/next-day swipe (gesture-handler) gains a horizontal
  **page-slide transition** on the content, so days feel like physical pages rather than
  instant content swaps.
- **No bottom sheet here** — adding to a past day is rare; the existing path stays.

## Out of scope (later phases)

- Theme switching / additional palettes (explicitly deferred; foundation should not block it).
- Path B quick-add hub (single-tap sheet with note/photo/voice type chips).
- Photo / voice variants of the bottom sheet.
- `@gorhom/bottom-sheet` migration (only if sheets spread to multiple screens).

## Success criteria

- Adding a quick note is faster and lower-friction than today (sheet + auto-focus vs.
  dial + screen push), and ends in a visible reward.
- Animations stay smooth while the JS thread is busy saving/loading (the reason for
  reanimated on the UI thread).
- The running timer is recognizable as "live" from across the room (breathing glow).
- `npm run check` stays green; the native rebuild installs and runs on the Android 17 device.
