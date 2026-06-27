# UI Redesign "Bold & Tactile" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Kelomit's three most-used surfaces (Home, Quick Add, Day) a bold, tactile,
dopamine-optimized feel — spring press states, count-up totals, a breathing timer glow, and a
drag-to-dismiss Quick Add bottom sheet with a save celebration — built on a new
`react-native-reanimated` foundation.

**Architecture:** Add reanimated (UI-thread springs) as a native dependency, then build a small
set of shared animation primitives (`<Bounceable>`, `usePressAnimation`, `<CountUp>`, a
`haptics` module) that every screen consumes. Screens are then migrated to those primitives and
the Quick Add note path is replaced with an in-house reanimated bottom sheet. The native install
is front-loaded behind a device-launch checkpoint so no visual work stacks on an unproven base.

**Tech Stack:** React Native 0.86 (new arch + Hermes), React 19.2.3, `react-native-reanimated`
4.x + `react-native-worklets`, existing `react-native-gesture-handler` 3.x, Zustand, jest 29.

**Source spec:** `docs/superpowers/specs/2026-06-26-ui-redesign-bold-tactile-design.md`

## Global Constraints

- **Palette unchanged.** Use only existing `Colors` keys from `src/theme/colors.ts`. No new
  colors, no recoloring. This redesign is motion/weight/feedback only.
- **Dependency budget: +2 packages total** — `react-native-reanimated` and its required peer
  `react-native-worklets`. No `@gorhom/bottom-sheet`, no haptics library. The bottom sheet is
  built in-house on reanimated + the already-installed gesture-handler.
- **`npm run check` must stay green after every task** (= eslint `--max-warnings=0` + `tsc
  --noEmit` + jest; currently 54 tests). This is the per-task gate alongside device checks.
- **Quick Add = Path A:** the sheet is the quick *note* path only. Photo/voice/full-editor
  (`AddEntryModal`) keep their screens; the FAB long-press dial is unchanged.
- **Native target:** must build and launch on the user's Android 17 device. Because this build
  adds a native dependency, an in-app **backup must be taken first** and the install is
  **uninstall → reinstall** (sideload in-place updates fail when native deps change — see
  `memory/kelomit-sideload-gotcha.md`). Increment `versionCode` for the rebuild.
- **Spring feel:** press-in scale `0.94`, press-out overshoot `1.04` settling to `1.0`. Sheet
  open spring damping ~18 / stiffness ~180. Glow ring loop ~2s, opacity 0.3 ↔ 0.6. These are
  the spec's tuning values — copy them verbatim; they are calibration knobs, expect on-device
  adjustment.

---

## File Structure

**New files:**
- `src/components/ui/Bounceable.tsx` — Pressable wrapper applying the spring press-scale.
- `src/components/ui/usePressAnimation.ts` — the reanimated shared-value + animated-style hook.
- `src/components/ui/CountUp.tsx` — animated number component.
- `src/utils/countUp.ts` — pure interpolation helper (TDD'd).
- `src/utils/haptics.ts` — named vibration patterns + `haptic()` wrapper (TDD'd).
- `src/components/quickadd/QuickAddSheet.tsx` — in-house reanimated bottom sheet (note path).
- `src/components/quickadd/sheetGesture.ts` — pure dismiss-threshold logic (TDD'd).
- `__tests__/countUp.test.ts`, `__tests__/haptics.test.ts`, `__tests__/sheetGesture.test.ts`
- `jest.setup.js` — reanimated jest mock wiring.

**Modified files:**
- `babel.config.js` — add the worklets babel plugin (must be last).
- `jest.config.js` — register `jest.setup.js`.
- `src/theme/index.ts` — add `black: '900'` weight.
- `src/components/ui/Card.tsx` — borderless variant.
- `src/components/ui/Button.tsx` — bounce press state.
- `src/components/entries/ActivityBadge.tsx` — solid-fill pills.
- `src/components/day/QuickTimerCard.tsx` — invert + glow + 72px clock.
- `src/components/entries/EntryListItem.tsx` — bounce + entrance animation.
- `src/components/ui/FAB.tsx` — 64px, glow ring, staggered dial, +→× rotation.
- `src/screens/HomeScreen.tsx` — black header, CountUp total, mount the sheet, save celebration.
- `src/screens/DayScreen.tsx` — page-slide transition on day swipe.
- `android/app/build.gradle` — bump `versionCode`.

---

## Task 1: Native foundation — install reanimated, wire babel + jest, device-launch checkpoint

**This task does no visual work.** Its only deliverable is: reanimated is installed and
working, the existing test suite is green, and the app still launches on the device. Nothing
else proceeds until this gate passes.

**Files:**
- Modify: `babel.config.js`
- Modify: `jest.config.js`
- Create: `jest.setup.js`
- Modify: `android/app/build.gradle` (versionCode bump)

**Interfaces:**
- Produces: a working reanimated runtime so later tasks can `import Animated, {useSharedValue,
  useAnimatedStyle, withSpring, withTiming, withRepeat, interpolate, runOnJS, Easing,
  SlideInLeft} from 'react-native-reanimated'`.

- [ ] **Step 1: Install the dependencies**

```bash
npm install react-native-reanimated react-native-worklets
```

Note: reanimated 4.x (correct for RN 0.86 new arch) requires the separate
`react-native-worklets` peer. If `npm` resolves reanimated 3.x instead, the worklets package is
unused and the babel plugin in Step 2 is `react-native-reanimated/plugin` — but on this
new-arch RN 0.86 setup, expect 4.x. Commit the resulting `package.json` + lockfile changes.

- [ ] **Step 2: Add the babel plugin (MUST be the last plugin)**

Edit `babel.config.js` to:

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

The worklets/reanimated babel plugin must always be listed **last**. (Reanimated 3.x fallback:
use `'react-native-reanimated/plugin'` here instead.)

- [ ] **Step 3: Create the jest mock setup**

Create `jest.setup.js`:

```js
// Reanimated ships a Jest mock; this makes animated components render in the
// pure-logic jest environment without a native runtime.
require('react-native-reanimated').setUpTests();
```

- [ ] **Step 4: Register the setup file in jest.config.js**

Edit `jest.config.js` to:

```js
module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['./jest.setup.js'],
};
```

- [ ] **Step 5: Run the existing suite — it must stay green**

Run: `npm run check`
Expected: PASS, 54 tests. If reanimated's mock breaks a test, fix the mock wiring per the
installed version's README before proceeding — a green suite is part of this gate.

- [ ] **Step 6: Bump versionCode for the native rebuild**

In `android/app/build.gradle`, find `versionCode 2` and change to `versionCode 3`. (Confirm the
current value first with `grep versionCode android/app/build.gradle`; increment whatever is
there.)

- [ ] **Step 7: DEVICE CHECKPOINT — rebuild, reinstall, confirm launch**

> ⚠️ Have the user take an in-app backup first (Settings → Data → Backup). This is an
> uninstall→reinstall because a native dep changed.

```bash
adb devices                       # confirm a device is attached (emulator was flaky historically)
adb uninstall com.kelomitapp      # native dep change → in-place update would fail
cd android && ANDROID_HOME=~/Library/Android/sdk ./gradlew :app:installDebug
```

Expected: app builds, installs, and **launches to Home without a redbox/crash**. Reanimated is
now proven on-device. If the build fails on the worklets plugin, recheck Step 2 (plugin must be
last) and that the new-arch Hermes build picked up the dependency.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json babel.config.js jest.config.js jest.setup.js android/app/build.gradle
git commit -m "build: add react-native-reanimated foundation (native rebuild)"
```

---

## Task 2: Add `black` (900) weight to the type scale

**Files:**
- Modify: `src/theme/index.ts:17-22`

**Interfaces:**
- Produces: `typography.weights.black` (value `'900'`) for use as a `fontWeight`.

- [ ] **Step 1: Add the weight**

In `src/theme/index.ts`, change the `weights` block to:

```ts
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
```

- [ ] **Step 2: Verify the type checks**

Run: `npm run check`
Expected: PASS, 54 tests (no behavior change, just a new constant).

- [ ] **Step 3: Commit**

```bash
git add src/theme/index.ts
git commit -m "feat: add black (900) font weight to type scale"
```

---

## Task 3: `haptics` module — named vibration patterns

**Files:**
- Create: `src/utils/haptics.ts`
- Test: `__tests__/haptics.test.ts`

**Interfaces:**
- Produces:
  - `HAPTIC_SAVE: number[]` = `[0, 35, 15, 55]`
  - `HAPTIC_START: number` = `40`
  - `HAPTIC_CANCEL: number[]` = `[0, 90]`
  - `haptic(pattern: number | number[]): void` — thin wrapper over `Vibration.vibrate`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/haptics.test.ts`:

```ts
import {Vibration} from 'react-native';
import {haptic, HAPTIC_SAVE, HAPTIC_START, HAPTIC_CANCEL} from '../src/utils/haptics';

describe('haptics', () => {
  it('exposes the spec patterns', () => {
    expect(HAPTIC_SAVE).toEqual([0, 35, 15, 55]);
    expect(HAPTIC_START).toBe(40);
    expect(HAPTIC_CANCEL).toEqual([0, 90]);
  });

  it('forwards the pattern to Vibration.vibrate', () => {
    const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    haptic(HAPTIC_SAVE);
    expect(spy).toHaveBeenCalledWith([0, 35, 15, 55]);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx jest haptics -v`
Expected: FAIL ("Cannot find module '../src/utils/haptics'").

- [ ] **Step 3: Implement the module**

Create `src/utils/haptics.ts`:

```ts
import {Vibration} from 'react-native';

// Centralized feedback patterns (spec "Bold & Tactile"). Patterns are
// Android Vibration arrays: [delay, on, off, on, ...]. Single number = one buzz.
export const HAPTIC_SAVE = [0, 35, 15, 55]; // short double-tap on save
export const HAPTIC_START = 40;             // single pulse on timer start
export const HAPTIC_CANCEL = [0, 90];       // one longer buzz for cancel/delete

export function haptic(pattern: number | number[]): void {
  Vibration.vibrate(pattern);
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx jest haptics -v`
Expected: PASS.

- [ ] **Step 5: Replace existing single-pulse call sites**

Swap the three current `Vibration.vibrate(40)` calls to use the module:
- `src/screens/QuickAddModal.tsx:133` → keep for now (the sheet supersedes it in Task 14, but
  update for consistency): replace `Vibration.vibrate(40)` with `haptic(HAPTIC_SAVE)` and add
  `import {haptic, HAPTIC_SAVE} from '../utils/haptics';` (remove the `Vibration` import if now
  unused).
- `src/components/day/QuickTimerCard.tsx:236` (start) → `haptic(HAPTIC_START)`.
- `src/components/day/QuickTimerCard.tsx:254` (stop) → `haptic(HAPTIC_SAVE)`.
  Add `import {haptic, HAPTIC_START, HAPTIC_SAVE} from '../../utils/haptics';` and drop the
  `Vibration` import from RN if unused.

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS, 55 tests (54 + the new haptics test).

- [ ] **Step 7: Commit**

```bash
git add src/utils/haptics.ts __tests__/haptics.test.ts src/screens/QuickAddModal.tsx src/components/day/QuickTimerCard.tsx
git commit -m "feat: centralize haptic feedback patterns"
```

---

## Task 4: `usePressAnimation` hook + `<Bounceable>` wrapper

These are visual primitives; correctness is device-verified. There is no pure logic to TDD here
beyond the constants, so the gate is `npm run check` green + an on-device bounce check.

**Files:**
- Create: `src/components/ui/usePressAnimation.ts`
- Create: `src/components/ui/Bounceable.tsx`

**Interfaces:**
- Produces:
  - `usePressAnimation(): {animatedStyle, onPressIn, onPressOut}` — `animatedStyle` is a
    reanimated style applying `scale`; the two handlers drive it.
  - `<Bounceable onPress?={() => void} onLongPress?={() => void} disabled?={boolean}
    style?={ViewStyle} hitSlop?={number} children>` — a `Pressable` wrapped in an
    `Animated.View` using the hook.

- [ ] **Step 1: Implement the hook**

Create `src/components/ui/usePressAnimation.ts`:

```ts
import {useSharedValue, useAnimatedStyle, withSpring} from 'react-native-reanimated';

// Spec spring press-state: in → 0.94, out → overshoot 1.04 → settle 1.0.
const SPRING = {damping: 12, stiffness: 320, mass: 0.5};

export function usePressAnimation() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.94, SPRING);
  };
  const onPressOut = () => {
    // Overshoot then settle — withSpring naturally overshoots to ~1.04 from 0.94
    // with this config; target 1 and let the spring carry past it.
    scale.value = withSpring(1, {damping: 9, stiffness: 260, mass: 0.5});
  };

  return {animatedStyle, onPressIn, onPressOut};
}
```

- [ ] **Step 2: Implement the wrapper**

Create `src/components/ui/Bounceable.tsx`:

```tsx
import React from 'react';
import {Pressable, type ViewStyle, type StyleProp} from 'react-native';
import Animated from 'react-native-reanimated';
import {usePressAnimation} from './usePressAnimation';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  delayLongPress?: number;
}

export default function Bounceable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  hitSlop,
  delayLongPress,
}: Props) {
  const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 55 tests. (Components render under the reanimated mock; no new test file — these
are device-verified primitives consumed by later tasks.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/usePressAnimation.ts src/components/ui/Bounceable.tsx
git commit -m "feat: add Bounceable press-spring primitive"
```

---

## Task 5: `<CountUp>` animated number

**Files:**
- Create: `src/utils/countUp.ts`
- Create: `src/components/ui/CountUp.tsx`
- Test: `__tests__/countUp.test.ts`

**Interfaces:**
- Produces:
  - `countUpValue(progress: number, target: number): number` — pure; `progress` 0..1 →
    rounded integer from 0 to `target`. Clamps progress to [0,1].
  - `<CountUp value={number} style?={TextStyle} durationMs?={number} format?={(n:number)=>string}>`
    — renders the value, animating from 0 → `value` on mount and on value change.

- [ ] **Step 1: Write the failing test**

Create `__tests__/countUp.test.ts`:

```ts
import {countUpValue} from '../src/utils/countUp';

describe('countUpValue', () => {
  it('is 0 at progress 0', () => {
    expect(countUpValue(0, 480)).toBe(0);
  });
  it('is the target at progress 1', () => {
    expect(countUpValue(1, 480)).toBe(480);
  });
  it('rounds at the midpoint', () => {
    expect(countUpValue(0.5, 480)).toBe(240);
    expect(countUpValue(0.5, 481)).toBe(241); // round, not floor
  });
  it('clamps out-of-range progress', () => {
    expect(countUpValue(-0.3, 480)).toBe(0);
    expect(countUpValue(1.4, 480)).toBe(480);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx jest countUp -v`
Expected: FAIL ("Cannot find module '../src/utils/countUp'").

- [ ] **Step 3: Implement the pure helper**

Create `src/utils/countUp.ts`:

```ts
// Pure mapping from animation progress (0..1) to a displayed integer.
export function countUpValue(progress: number, target: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.round(p * target);
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx jest countUp -v`
Expected: PASS.

- [ ] **Step 5: Implement the component**

Create `src/components/ui/CountUp.tsx`:

```tsx
import React, {useEffect, useState} from 'react';
import {Text, type TextStyle, type StyleProp} from 'react-native';
import {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {countUpValue} from '../../utils/countUp';

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  durationMs?: number;
  format?: (n: number) => string;
}

export default function CountUp({value, style, durationMs = 600, format}: Props) {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {duration: durationMs, easing: Easing.out(Easing.cubic)});
  }, [value, durationMs, progress]);

  useAnimatedReaction(
    () => countUpValue(progress.value, value),
    current => runOnJS(setDisplay)(current),
  );

  return <Text style={style}>{format ? format(display) : String(display)}</Text>;
}
```

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 7: Commit**

```bash
git add src/utils/countUp.ts src/components/ui/CountUp.tsx __tests__/countUp.test.ts
git commit -m "feat: add CountUp animated number component"
```

---

## Task 6: Borderless cards + bouncing Button

**Files:**
- Modify: `src/components/ui/Card.tsx`
- Modify: `src/components/ui/Button.tsx`

**Interfaces:**
- Consumes: `usePressAnimation` (Task 4).
- Produces: `Card` unchanged API but borderless/stronger-bg; `Button` unchanged API, now bounces.

- [ ] **Step 1: Make Card rely on background, drop the heavy shadow border-feel**

In `src/components/ui/Card.tsx`, the card already has no border — keep `bgCard` but soften the
shadow so differentiation comes from the background block, not an outline. Change the `card`
style to:

```ts
    card: {
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      padding: spacing.lg,
      shadowColor: c.shadow,
      shadowOpacity: 0.05,
      shadowOffset: {width: 0, height: 1},
      shadowRadius: 3,
      elevation: 1,
    },
```

- [ ] **Step 2: Convert Button to a bouncing Pressable**

Rewrite `src/components/ui/Button.tsx` to drive the press-spring (keeping the exact same props
and visual styles):

```tsx
import React, {useMemo} from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {usePressAnimation} from './usePressAnimation';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    base: {
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {backgroundColor: c.primary},
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    ghost: {backgroundColor: 'transparent'},
    danger: {backgroundColor: c.error},
    disabled: {opacity: 0.45},
    text: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.bold,
    },
    primaryText: {color: c.white},
    secondaryText: {color: c.primary},
    ghostText: {color: c.textSecondary},
    dangerText: {color: c.white},
  });

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();
  const isOff = disabled || loading;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[styles.base, styles[variant], isOff && styles.disabled, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isOff}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? colors.white : colors.primary}
            size="small"
          />
        ) : (
          <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles] as any]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
```

(Note: button text weight bumped semibold → bold per the spec's "one weight step up" rule.)

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Card.tsx src/components/ui/Button.tsx
git commit -m "feat: borderless cards and bouncing Button"
```

---

## Task 7: Solid-fill activity pills

**Files:**
- Modify: `src/components/entries/ActivityBadge.tsx`

**Interfaces:**
- Produces: `ActivityBadge` unchanged API; outline pill → solid colored pill.

- [ ] **Step 1: Read the current badge to match its structure**

Run: `cat src/components/entries/ActivityBadge.tsx` and note the per-`activity_type` color
mapping (uses `badgeWork` / `badgePersonalWork` / `badgePersonal`).

- [ ] **Step 2: Convert outline → solid fill**

Change the badge so the pill `backgroundColor` is the activity color at full opacity and the
label is `c.white`, instead of a tinted background + colored text. Concretely: where the style
currently sets `backgroundColor: color + '15'` (or similar tint) and `color: <activityColor>`
for the text, set the container `backgroundColor: <activityColor>` and the text
`color: c.white, fontWeight: typography.weights.bold`. Keep padding/radius as-is.

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 4: Commit**

```bash
git add src/components/entries/ActivityBadge.tsx
git commit -m "feat: solid-fill activity pills"
```

---

## Task 8: Home header (black weight) + CountUp day total

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `CountUp` (Task 5), `typography.weights.black` (Task 2).

- [ ] **Step 1: Bump the header date weight to black**

In `src/screens/HomeScreen.tsx`, in `makeStyles`, change `headerDate.fontWeight` from
`typography.weights.bold` to `typography.weights.black`.

- [ ] **Step 2: Animate the day total with CountUp**

`formatHours` returns a string (e.g. "8.0 h"), so CountUp animates the underlying *seconds* and
formats with `formatHours`. Add the import:

```tsx
import CountUp from '../components/ui/CountUp';
```

Replace the header total block (currently `{totalSecs > 0 && (<Text style={styles.headerTotal}>{formatHours(totalSecs)}</Text>)}`) with:

```tsx
        {totalSecs > 0 && (
          <CountUp
            value={totalSecs}
            style={styles.headerTotal}
            format={formatHours}
          />
        )}
```

`formatHours` is already imported in this file.

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 4: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: bold Home header with count-up day total"
```

---

## Task 9: Timer card — invert + breathing glow + 72px clock

**Files:**
- Modify: `src/components/day/QuickTimerCard.tsx`

**Interfaces:**
- Consumes: reanimated (`useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withTiming`),
  `typography.weights.black`.

- [ ] **Step 1: Add the running-state inversion styles**

In `QuickTimerCard`'s `makeStyles`, change/add:
- `clock.fontSize` from `44` to `72`, and `clock.fontWeight` to `typography.weights.black`.
- Add an inverted running palette. Add styles:

```ts
    cardRunningSolid: {backgroundColor: c.primary, borderColor: c.primary},
    titleInverted: {color: c.white},
    clockInverted: {color: c.white},
    runningTargetInverted: {color: c.white},
    runningStartedInverted: {color: c.white},
    glow: {
      position: 'absolute',
      top: -3, left: -3, right: -3, bottom: -3,
      borderRadius: radius.lg + 3,
      borderWidth: 3,
      borderColor: c.primary,
    },
```

- [ ] **Step 2: Add the breathing-glow animation**

At the top of the component body, add the shared value + animated style (spec: ~2s loop, opacity
0.3 ↔ 0.6):

```tsx
  const glowOpacity = useSharedValue(0.3);
  useEffect(() => {
    if (active) {
      glowOpacity.value = withRepeat(
        withTiming(0.6, {duration: 1000, easing: Easing.inOut(Easing.quad)}),
        -1,
        true,
      );
    } else {
      glowOpacity.value = 0.3;
    }
  }, [active, glowOpacity]);
  const glowStyle = useAnimatedStyle(() => ({opacity: glowOpacity.value}));
```

Add imports:

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
```

- [ ] **Step 3: Apply inversion + glow in the running branch**

In the `if (active)` return block: add `styles.cardRunningSolid` to the card's style array
(replacing the old tinted `styles.cardRunning`), wrap the card in a relative container holding an
`<Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />` behind it, and append
the `*Inverted` styles to the title/clock/target/started `Text` elements. The Stop/Cancel buttons
become white-on-primary: set stop button background to `c.white` and its text color to
`c.primary` while running.

- [ ] **Step 4: Spring the idle→running scale**

Add a `cardScale` shared value defaulting to 1; in the same `active` effect, on becoming active
set `cardScale.value = withSpring(1, {damping: 11, stiffness: 200})` after seeding it to `0.96`,
and apply `useAnimatedStyle(() => ({transform:[{scale:cardScale.value}]}))` to the running card's
`Animated.View`. (Keep it subtle; this is a calibration knob.)

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 6: DEVICE CHECKPOINT — verify the running timer**

Rebuild JS (Metro reload is enough — no native change here): start a timer on Home. Confirm: card
turns solid orange, 72px white clock, a ring gently breathes around it (~2s), Stop is
white-on-orange. Stop the timer; card returns to idle.

- [ ] **Step 7: Commit**

```bash
git add src/components/day/QuickTimerCard.tsx
git commit -m "feat: inverted timer card with breathing glow and 72px clock"
```

---

## Task 10: Entry list — bounce press + slide-in entrance

**Files:**
- Modify: `src/components/entries/EntryListItem.tsx`

**Interfaces:**
- Consumes: reanimated (`Animated`, `SlideInLeft`), `usePressAnimation` pattern.
- Produces: list items bounce on press and animate in on first appearance.

- [ ] **Step 1: Wrap the item in an entering-animated, bouncing Pressable**

In `src/components/entries/EntryListItem.tsx`:
- Replace the `TouchableOpacity` import with `Pressable` from `react-native` and add
  `import Animated, {SlideInLeft} from 'react-native-reanimated';` plus
  `import {usePressAnimation} from '../ui/usePressAnimation';`.
- In the component body add `const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();`
- Change the outer element from `<TouchableOpacity style={styles.item} onPress={onPress}
  activeOpacity={0.7}>` to:

```tsx
    <Animated.View entering={SlideInLeft.springify().damping(16)} style={animatedStyle}>
      <Pressable
        style={styles.item}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}>
        {/* ...existing inner content unchanged... */}
      </Pressable>
    </Animated.View>
```

Keep all existing inner JSX exactly as-is; only the wrapper changes.

- [ ] **Step 2: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 3: DEVICE CHECKPOINT — verify entrance + press**

Metro reload. On Home, confirm list items scale-bounce when tapped. Add a note (via the current
flow) and confirm the new row slides in from the left. (Note: `SlideInLeft` fires on mount of
each item; if every item animates on every screen focus and that feels noisy, that's a
calibration call for Task 14's integration — leave as-is here.)

- [ ] **Step 4: Commit**

```bash
git add src/components/entries/EntryListItem.tsx
git commit -m "feat: bounce + slide-in entrance for entry list items"
```

---

## Task 11: FAB — 64px, glow ring, staggered dial, +→× rotation

**Files:**
- Modify: `src/components/ui/FAB.tsx`

**Interfaces:**
- Consumes: reanimated.
- Produces: `FAB` unchanged API; larger, glowing, animated dial.

- [ ] **Step 1: Grow the FAB and add a pulsing glow ring**

In `FAB.tsx` `makeStyles`, change `fab` (and `closeFab`) `width`/`height` from `58` to `64`, and
`bottom`/`right` stay `24`. Add a `glowRing` style:

```ts
    glowRing: {
      position: 'absolute',
      bottom: 24 - 4,
      right: 24 - 4,
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: c.primary,
    },
```

Add a shared value pulsing its opacity 0.3↔0.6 (~2s) like the timer glow, and render
`<Animated.View style={[styles.glowRing, glowStyle]} pointerEvents="none" />` behind the main FAB.

- [ ] **Step 2: Rotate the "+" to "×" via a shared rotation**

Drive the icon rotation from `expanded`: a shared value `rot` → `withTiming(expanded ? 1 : 0,
{duration: 180})`, mapped to `interpolate(rot.value, [0,1], [0,45])` deg on the `+` label's
animated style. (The modal already swaps to a close icon; the rotation is for the main label
before/while opening — keep the existing close button behavior.)

- [ ] **Step 3: Stagger the dial actions in**

In the dial `Modal`, give each action row an `entering` animation offset by index so they cascade
(spec: ~40ms apart):

```tsx
import Animated, {FadeInDown} from 'react-native-reanimated';
// ...
{actions!.map((a, i) => (
  <Animated.View key={a.key} entering={FadeInDown.delay(i * 40).springify()} style={styles.actionRow}>
    {/* existing actionLabel + action button JSX */}
  </Animated.View>
))}
```

(Convert the inner action `TouchableOpacity` buttons to `Bounceable` for press feedback while
here.)

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: PASS, 56 tests.

- [ ] **Step 5: DEVICE CHECKPOINT — verify FAB**

Metro reload. Confirm: FAB is bigger with a faint breathing ring; long-press → actions cascade in
bottom-to-top; close works.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FAB.tsx
git commit -m "feat: larger glowing FAB with staggered dial"
```

---

## Task 12: `sheetGesture` — pure dismiss-threshold logic

**Files:**
- Create: `src/components/quickadd/sheetGesture.ts`
- Test: `__tests__/sheetGesture.test.ts`

**Interfaces:**
- Produces: `shouldDismiss(translationY: number, velocityY: number, sheetHeight: number):
  boolean` — true if dragged past 1/3 of the sheet height **or** flung down fast
  (velocity > 800). Negative/upward translation never dismisses.

- [ ] **Step 1: Write the failing test**

Create `__tests__/sheetGesture.test.ts`:

```ts
import {shouldDismiss} from '../src/components/quickadd/sheetGesture';

const H = 600;

describe('shouldDismiss', () => {
  it('dismisses when dragged past one third', () => {
    expect(shouldDismiss(H / 3 + 1, 0, H)).toBe(true);
  });
  it('stays open when dragged less than one third slowly', () => {
    expect(shouldDismiss(H / 3 - 1, 0, H)).toBe(false);
  });
  it('dismisses on a fast downward fling even if short', () => {
    expect(shouldDismiss(40, 900, H)).toBe(true);
  });
  it('never dismisses on upward drag', () => {
    expect(shouldDismiss(-300, -2000, H)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx jest sheetGesture -v`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement**

Create `src/components/quickadd/sheetGesture.ts`:

```ts
// Pure decision for the Quick Add sheet pan-gesture release.
// translationY > 0 means dragged downward. Dismiss if past 1/3 of the sheet
// height, or on a fast downward fling. Upward drags never dismiss.
const FLING_VELOCITY = 800;

export function shouldDismiss(
  translationY: number,
  velocityY: number,
  sheetHeight: number,
): boolean {
  if (translationY <= 0) {
    return false;
  }
  return translationY > sheetHeight / 3 || velocityY > FLING_VELOCITY;
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx jest sheetGesture -v`
Expected: PASS.

- [ ] **Step 5: Run the full check**

Run: `npm run check`
Expected: PASS, 57 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/quickadd/sheetGesture.ts __tests__/sheetGesture.test.ts
git commit -m "feat: pure dismiss-threshold logic for Quick Add sheet"
```

---

## Task 13: `<QuickAddSheet>` component

The in-house reanimated bottom sheet holding the quick-note form. Mounts at Home level; controlled
by a `visible` prop. Contains the same fields as `QuickAddModal` (attachments, title, duration).

**Files:**
- Create: `src/components/quickadd/QuickAddSheet.tsx`

**Interfaces:**
- Consumes: `shouldDismiss` (Task 12), reanimated, gesture-handler, `haptic`/`HAPTIC_SAVE`
  (Task 3), the existing `AttachmentsSection`, `useEntryStore`, `useSettingsStore`,
  `useTagStore`, `addEntryMedia`, `getLastKnownPosition` (all already used by `QuickAddModal`).
- Produces: `<QuickAddSheet visible={boolean} dayId={number} onClose={() => void}
  onSaved={() => void}>` — slides up when `visible`, saves a note, calls `onSaved` then `onClose`.

- [ ] **Step 1: Build the sheet shell (translateY + backdrop + pan)**

Create `src/components/quickadd/QuickAddSheet.tsx`. Port the save logic from
`QuickAddModal.tsx:95-140` (it is identical — note creation + media + GPS + reload), and wrap it
in the animated sheet. Full component:

```tsx
import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
  Keyboard,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useEntryStore} from '../../store/entryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useTagStore} from '../../store/tagStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import Button from '../ui/Button';
import AttachmentsSection, {type EditorMedia} from '../media/AttachmentsSection';
import {ensureMediaDir} from '../../utils/mediaUtils';
import {addEntryMedia} from '../../db/entries';
import {getLastKnownPosition} from '../../services/gpsService';
import {haptic, HAPTIC_SAVE} from '../../utils/haptics';
import {shouldDismiss} from './sheetGesture';

interface Props {
  visible: boolean;
  dayId: number;
  onClose: () => void;
  onSaved: () => void;
}

const SPRING = {damping: 18, stiffness: 180};

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    fill: {...StyleSheet.absoluteFillObject, justifyContent: 'flex-end'},
    backdrop: {...StyleSheet.absoluteFillObject, backgroundColor: '#000'},
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      maxHeight: '90%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    heading: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.black,
      color: c.textPrimary,
    },
    defaultsNote: {fontSize: typography.sizes.xs, color: c.textMuted, marginBottom: spacing.md},
    sectionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    durationRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    durationInput: {flex: 1, textAlign: 'center'},
    durationUnit: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    saveRow: {marginTop: spacing.xl},
  });

export default function QuickAddSheet({visible, dayId, onClose, onSaved}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {height: screenH} = useWindowDimensions();

  const {addEntry, loadEntriesForDay} = useEntryStore();
  const {getOrCreate} = useTagStore();
  const {
    loaded: settingsLoaded,
    load: loadSettings,
    quickadd_default_activity,
    quickadd_default_project_id,
    quickadd_default_tag,
  } = useSettingsStore();

  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [media, setMedia] = useState<EditorMedia[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [sheetH, setSheetH] = useState(screenH * 0.6);

  const translateY = useSharedValue(screenH);

  useEffect(() => {
    if (!settingsLoaded) { loadSettings(); }
    ensureMediaDir().catch(() => {});
  }, [settingsLoaded, loadSettings]);

  // Open / close driven by `visible`.
  useEffect(() => {
    translateY.value = withSpring(visible ? 0 : screenH, SPRING);
    if (!visible) { Keyboard.dismiss(); }
  }, [visible, screenH, translateY]);

  const close = () => {
    translateY.value = withTiming(screenH, {duration: 220}, finished => {
      if (finished) { runOnJS(onClose)(); }
    });
  };

  const onLayout = (e: LayoutChangeEvent) => setSheetH(e.nativeEvent.layout.height);

  const pan = Gesture.Pan()
    .onUpdate(e => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd(e => {
      if (shouldDismiss(e.translationY, e.velocityY, sheetH)) {
        translateY.value = withTiming(screenH, {duration: 220}, finished => {
          if (finished) { runOnJS(onClose)(); }
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, screenH],
      [0.5, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const resetForm = () => {
    setTitle('');
    setDurationMinutes('');
    setMedia([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const durationSec = durationMinutes.trim()
        ? Math.round(parseFloat(durationMinutes) * 60)
        : null;
      const tagName = quickadd_default_tag.trim();
      const tagIds: number[] = [];
      if (tagName) {
        const tag = await getOrCreate(tagName);
        tagIds.push(tag.id);
      }
      const gps = getLastKnownPosition();
      const created = await addEntry({
        day_id: dayId,
        entry_type: 'note',
        activity_type: quickadd_default_activity,
        title: title.trim() || null,
        body: null,
        project_id: quickadd_default_project_id,
        tagIds,
        duration_sec: durationSec,
        time_from: null,
        time_to: null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
      });
      for (const m of media) {
        await addEntryMedia(created.id, {
          media_type: m.media_type,
          file_path: m.file_path,
          thumbnail_path: m.thumbnail_path,
          duration_sec: m.duration_sec,
        });
      }
      await loadEntriesForDay(dayId);
      haptic(HAPTIC_SAVE);
      resetForm();
      onSaved();
      close();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.fill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} onTouchStart={close} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, sheetStyle]} onLayout={onLayout}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{t('quickEntryType.note')}</Text>
            <Text style={styles.defaultsNote}>
              {t('entries.quickDefaults', {
                activity: t(`activity.${quickadd_default_activity}`),
                tag: quickadd_default_tag.trim() ? ` · #${quickadd_default_tag.trim()}` : '',
              })}
            </Text>

            <AttachmentsSection
              media={media}
              onAdd={m => setMedia(prev => [...prev, m])}
              onRemove={i => setMedia(prev => prev.filter((_, idx) => idx !== i))}
            />

            <Text style={styles.sectionLabel}>{t('entries.title')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('entries.quickTitlePlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={120}
            />

            <Text style={styles.sectionLabel}>{t('entries.durationOptional')}</Text>
            <View style={styles.durationRow}>
              <TextInput
                style={[styles.input, styles.durationInput]}
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                placeholder={t('entries.minutes')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.durationUnit}>{t('entries.minuteUnit')}</Text>
            </View>

            <View style={styles.saveRow}>
              <Button label={t('common.save')} onPress={handleSave} loading={isSaving} />
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
```

Note on keyboard: `autoFocus` raises the keyboard; the sheet is anchored to the bottom of a
full-height overlay with `justifyContent: 'flex-end'` and `maxHeight: 90%`, and the inner
`ScrollView` with `keyboardShouldPersistTaps="handled"` keeps fields reachable. If on-device the
keyboard covers the Save button, wrap the overlay in `KeyboardAvoidingView` (RN core, no dep) as a
calibration follow-up.

- [ ] **Step 2: Run the check**

Run: `npm run check`
Expected: PASS, 57 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/quickadd/QuickAddSheet.tsx
git commit -m "feat: in-house QuickAddSheet bottom sheet (note path)"
```

---

## Task 14: Wire the sheet into Home + save celebration

Replace the note path's navigation push with the sheet. Photo/video/voice dial actions still
navigate to `QuickAddModal` (Path A — only the note path changes).

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/entries/quickAddActions.ts` (note routes to a callback, not navigation)

**Interfaces:**
- Consumes: `<QuickAddSheet>` (Task 13).

- [ ] **Step 1: Make Home own the sheet visibility**

> Path A is conservative on purpose (the user has an unformed quick-add idea). The FAB
> **short-tap keeps opening the full editor** (`AddEntryModal`) — do NOT change `openAddEntry`.
> Only the **dial's "note" action** (Step 2) is rerouted to the sheet, which is exactly "the
> sheet replaces the quick-note path" while "the full editor keeps its screen". This is the
> primary candidate for on-device reconsideration — if the user wants the sheet on short-tap,
> it's a one-line change then.

In `src/screens/HomeScreen.tsx`:
- Add `import QuickAddSheet from '../components/quickadd/QuickAddSheet';` and
  `const [sheetOpen, setSheetOpen] = useState(false);`
- Leave `openAddEntry` (the FAB short-tap → `AddEntryModal`) **unchanged**.
- Mount the sheet just before the closing `</SafeAreaView>`, after `<FAB ... />`:

```tsx
      {today && (
        <QuickAddSheet
          visible={sheetOpen}
          dayId={today.id}
          onClose={() => setSheetOpen(false)}
          onSaved={() => { /* list already reloaded by the sheet; entrance anim handles the reveal */ }}
        />
      )}
```

- [ ] **Step 2: Point the dial's "note" action at the sheet**

The FAB long-press dial currently routes every type (including note) to `QuickAddModal`. Make the
`note` action open the sheet while the others keep navigating. In `HomeScreen`, change the
`quickActions` builder call so the note type opens the sheet:

```tsx
  const quickActions = today
    ? buildQuickAddActions(entryType => {
        if (entryType === 'note') {
          setSheetOpen(true);
        } else {
          navigation.navigate('QuickAddModal', {date, dayId: today.id, entryType});
        }
      })
    : undefined;
```

(`quickAddActions.ts` needs no change — it already passes `entryType` to the callback.)

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 57 tests.

- [ ] **Step 4: DEVICE CHECKPOINT — the full Quick Add flow + celebration**

Metro reload. On Home:
1. Tap the FAB → sheet springs up, title field focused, keyboard up.
2. Drag the handle down a little → backdrop dims proportionally; release → springs back.
3. Drag past 1/3 or fling down → sheet dismisses, no save.
4. Type a title, tap Save → save haptic fires, sheet springs down and out, the new note is
   sitting in the list (slide-in entrance) as the sheet leaves.
5. Long-press FAB → dial; tap Note → the sheet opens; tap Photo → old `QuickAddModal` still
   opens (Path A intact). Short-tap FAB → full `AddEntryModal` editor still opens (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: Quick Add bottom sheet on Home with save celebration"
```

---

## Task 15: Day screen page-slide + final device verification

**Files:**
- Modify: `src/screens/DayScreen.tsx`

**Interfaces:**
- Consumes: reanimated entering animations.

- [ ] **Step 1: Inspect the Day screen swipe**

Run: `sed -n '1,80p' src/screens/DayScreen.tsx` to find how the prev/next-day swipe is wired
(it mirrors Home's `Gesture.Pan` → `navigation.navigate('DayScreen', {date})`). Note the
container that holds the day content.

- [ ] **Step 2: Add a horizontal slide entrance to the day content**

Wrap the Day screen's scrollable content container in an `Animated.View` keyed by the date so it
re-mounts (and re-animates) on each day change, with a horizontal entrance:

```tsx
import Animated, {SlideInRight} from 'react-native-reanimated';
// ...
<Animated.View key={date} entering={SlideInRight.springify().damping(18)} style={styles.flex}>
  {/* existing day content */}
</Animated.View>
```

Use `SlideInRight` for next-day and accept the same direction both ways for simplicity (a
direction-aware variant is a later calibration nicety, not required by the spec). The Day screen
already inherits bounce/CountUp/solid-pills/borderless cards via the shared components — no extra
work for those.

- [ ] **Step 3: Run the check**

Run: `npm run check`
Expected: PASS, 57 tests.

- [ ] **Step 4: FINAL DEVICE CHECKPOINT — full rebuild + regression pass**

> Native deps were added back in Task 1; JS-only changes since then apply on Metro reload. For a
> clean final verification do a full rebuild and exercise everything.

```bash
adb devices
cd android && ANDROID_HOME=~/Library/Android/sdk ./gradlew :app:installDebug
```

Verify against the spec's success criteria:
- Quick note add is fast and ends in a visible reward (sheet + auto-focus + celebration).
- Animations stay smooth while saving/loading (the reanimated-on-UI-thread payoff).
- Running timer is recognizable as "live" from across the room (breathing glow).
- Day screen: swiping prev/next slides the content like pages; totals count up; items bounce.
- `npm run check` green (57 tests).
- No redbox; backup/restore and existing flows still work (regression).

- [ ] **Step 5: Commit**

```bash
git add src/screens/DayScreen.tsx
git commit -m "feat: page-slide transition on Day screen day-swipe"
```

---

## Self-Review Notes

- **Spec coverage:** type scale (T2), Bounceable/usePressAnimation (T4), CountUp (T5),
  borderless cards + solid pills (T6/T7), haptic patterns (T3), Home header/total (T8), timer
  invert+glow+72px (T9), entry bounce+slide-in (T10), FAB 64px+glow+stagger+rotate (T11),
  QuickAddSheet drag-dismiss/keyboard/auto-focus (T12/T13), wire + save celebration (T14), Day
  page-slide (T15), reanimated foundation + device checkpoint (T1). Deferred items (themes,
  Path B, photo/voice sheets, @gorhom) are correctly absent.
- **Calibration knobs:** all spring/duration/opacity numbers are starting values flagged for
  on-device tuning, per the Global Constraints. Expect to adjust them during the device
  checkpoints — that is the physical-world tuning, not a plan defect.
- **Risk front-loaded:** the only native-dependency risk (reanimated build) is Task 1 behind a
  hard device-launch gate; every later task is JS-only and applies on a Metro reload.
