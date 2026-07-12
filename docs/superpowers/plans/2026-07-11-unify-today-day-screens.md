# Unify Today / Day Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `HomeScreen` (Today) and `DayScreen` (a specific day) into one shared `DayView` body, and move the day-detail route to the root stack so Back returns the user to where they came from.

**Architecture:** A single `DayView` component owns the ScrollView, swipe, data-loading, filter state, and the shared day content; it renders a today header + today-only extras + floating-bar padding for `variant="today"`, and nothing extra for `variant="detail"`. `HomeScreen` (Today tab) and `DayScreen` (root-stack route) become thin wrappers. Day-detail and `DayMap` move from the Home tab's nested stack to the root stack, so popping them reveals `MainTabs` with the entry tab (Calendar/Today) still active.

**Tech Stack:** React Native, `@react-navigation/native` (native-stack + bottom-tabs), `react-native-reanimated`, `react-native-gesture-handler`, zustand stores.

## Global Constraints

- No new dependencies. Everything uses already-installed libs.
- This work is JS-only — no native changes (Metro reload, no rebuild).
- These are navigation/UI wiring changes with **no new pure logic**, so there are no jest unit tests to add. Each task's automated gate is `npx tsc --noEmit -p tsconfig.json` + `npx eslint <changed files>` clean, plus `npx jest` (existing 140 tests stay green), plus the Android JS bundle building. Behavioural correctness is verified on device per the checklist in Task 5.
- Bundle command (used as the "does it build" gate):
  `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/kelomit-bundle.js --assets-dest /tmp/kelomit-assets`
- Keep `DayView` focused on "load + render one day". Wrappers stay thin.
- Spec: `docs/superpowers/specs/2026-07-11-unify-today-day-screens-design.md`.

---

## File Structure

- **Create** `src/components/day/DayView.tsx` — shared day body (ScrollView, swipe, data-load, filter state, today header + extras, per-variant padding).
- **Modify** `src/screens/HomeScreen.tsx` — thin Today wrapper around `DayView variant="today"`.
- **Modify** `src/screens/DayScreen.tsx` — thin detail wrapper around `DayView variant="detail"` + native header + FAB; holds `date` state.
- **Modify** `src/navigation/navigationTypes.ts` — drop `HomeStackParamList`; add `DayMap` to `RootStackParamList`; `Home` tab param becomes `undefined`; remove `HomeStackScreenProps`.
- **Modify** `src/navigation/RootNavigator.tsx` — register `DayScreen` + `DayMap` at root.
- **Modify** `src/navigation/MainTabs.tsx` — Home tab renders `HomeScreen` directly.
- **Delete** `src/navigation/HomeStack.tsx`.
- **Modify** `src/screens/DayMapScreen.tsx` — prop type `HomeStackScreenProps` → `RootStackScreenProps`.
- **Modify** `src/screens/CalendarScreen.tsx` — `navigate('DayScreen', {date})`.
- **Modify** `src/navigation/NavShell.tsx` — remove the nested-Home-detail hide logic.

---

## Task 1: Create `DayView` and switch the Today tab to it

Behaviour-preserving for Today: after this task the Today tab looks and behaves exactly as before, but is rendered by the new shared component. The `detail` variant code path exists but isn't used yet (wired in Task 2).

**Files:**
- Create: `src/components/day/DayView.tsx`
- Modify: `src/screens/HomeScreen.tsx` (full rewrite to thin wrapper)

**Interfaces:**
- Produces: `DayView` (default export) with props
  `{ date: string; variant: 'today' | 'detail'; onRequestDate: (date: string) => void; onOpenEntry: (entry: Entry) => void; onDayLoaded?: (day: Day | null) => void }`.

- [ ] **Step 1: Create `src/components/day/DayView.tsx`**

```tsx
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView, AppState} from 'react-native';
import {format} from 'date-fns';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useFocusEffect} from '@react-navigation/native';
import {useDayStore} from '../../store/dayStore';
import {useEntryStore} from '../../store/entryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {getDateFnsLocale} from '../../i18n';
import DayHoursReadout from './DayHoursReadout';
import DaySummaryCard from './DaySummaryCard';
import DaySplitBar from './DaySplitBar';
import SpecialNoteCard from './SpecialNoteCard';
import DayEndConfirmBanner from './DayEndConfirmBanner';
import QuickTimerCard from './QuickTimerCard';
import FilterBar from './FilterBar';
import EntryList from '../entries/EntryList';
import EntryListItem from '../entries/EntryListItem';
import {useShellPadding} from '../../navigation/shellMetrics';
import {useKeyboardHeight} from '../../hooks/useKeyboardHeight';
import {getUpcomingTodos} from '../../db/entries';
import {formatDate, nextDayDates, shiftDate} from '../../utils/dateUtils';
import {calcDayWorkSecs, calcHourBreakdown} from '../../utils/hoursUtils';
import {getCurrentGeofenceDetection, type GeofenceDetection} from '../../services/gpsService';
import type {Day, Entry, Project, Tag} from '../../types';

interface Props {
  date: string;
  variant: 'today' | 'detail';
  onRequestDate: (date: string) => void;
  onOpenEntry: (entry: Entry) => void;
  onDayLoaded?: (day: Day | null) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    flex: {flex: 1},
    header: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    headerRow: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between'},
    headerDate: {fontSize: typography.sizes.xxl, fontWeight: typography.weights.black, color: c.textPrimary},
    headerSub: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    detailTopPad: {paddingTop: spacing.md, paddingBottom: 100},
    comingUp: {marginTop: spacing.lg},
    comingUpHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    comingUpDate: {
      fontSize: typography.sizes.xs,
      color: c.primary,
      fontWeight: typography.weights.semibold,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    whereAmI: {
      textAlign: 'center',
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
    },
  });

export default function DayView({date, variant, onRequestDate, onOpenEntry, onDayLoaded}: Props) {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isToday = variant === 'today';
  const shellPad = useShellPadding();
  const kbHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [upcoming, setUpcoming] = useState<Entry[]>([]);
  const [detected, setDetected] = useState<GeofenceDetection>('unknown');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const showPersonalHours = useSettingsStore(s => s.show_personal_hours);

  const day = daysCache[date];
  const allEntries = useMemo(() => (day ? (entriesByDay[day.id] ?? []) : []), [day, entriesByDay]);

  useEffect(() => { loadDay(date); }, [date, loadDay]);
  useEffect(() => { if (day) { loadEntriesForDay(day.id); } }, [day, loadEntriesForDay]);
  useEffect(() => { onDayLoaded?.(day ?? null); }, [day, onDayLoaded]);

  // Reset filters when the viewed date changes (detail swipe).
  useEffect(() => { setSelectedProjectId(null); setSelectedTagIds([]); }, [date]);

  // Lift the day-note card above the keyboard once it's shown.
  useEffect(() => {
    if (noteEditing && kbHeight > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: true}));
    }
  }, [noteEditing, kbHeight]);

  // --- Today-only effects ---
  const loadUpcoming = useCallback(() => {
    getUpcomingTodos(nextDayDates()).then(setUpcoming).catch(() => {});
  }, []);

  // Refresh today's day + upcoming on focus (post-add, tab switch).
  useFocusEffect(
    useCallback(() => {
      if (isToday) { loadDay(date); loadUpcoming(); }
    }, [isToday, loadDay, date, loadUpcoming]),
  );

  // Re-read today on foreground: midnight rollover / background geofence stamps.
  useEffect(() => {
    if (!isToday) { return; }
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { loadDay(date); } });
    return () => sub.remove();
  }, [isToday, date, loadDay]);

  // Poll geofence membership for the "where am I" line.
  useEffect(() => {
    if (!isToday) { return; }
    const tick = () => setDetected(getCurrentGeofenceDetection());
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [isToday]);

  const placeLabel = (d: GeofenceDetection) =>
    d === 'work' ? t('location.work')
      : d === 'home' ? t('location.home')
      : d === 'other' ? t('location.placeOther')
      : t('location.placeUnknown');

  // Filter chips list only the projects/tags used in this day's notes.
  const dayProjects = useMemo(() => {
    const seen = new Map<number, Project>();
    for (const e of allEntries) { if (e.project) { seen.set(e.project.id, e.project); } }
    return [...seen.values()];
  }, [allEntries]);
  const dayTags = useMemo(() => {
    const seen = new Map<number, Tag>();
    for (const e of allEntries) { for (const tag of e.tags ?? []) { seen.set(tag.id, tag); } }
    return [...seen.values()];
  }, [allEntries]);

  const filteredEntries: Entry[] = allEntries.filter(e => {
    if (selectedProjectId != null && e.project?.id !== selectedProjectId) { return false; }
    if (selectedTagIds.length > 0) {
      const entryTagIds = (e.tags ?? []).map(x => x.id);
      if (!selectedTagIds.every(id => entryTagIds.includes(id))) { return false; }
    }
    return true;
  });

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);
  const clearFilters = useCallback(() => { setSelectedProjectId(null); setSelectedTagIds([]); }, []);

  const totalSecs = day ? calcDayWorkSecs(day, allEntries) : 0;
  const personalSecs = day ? calcHourBreakdown(allEntries).personalSeconds : 0;

  // Swipe = prev/next day. Today is the end of the line (no forward swipe).
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd(e => {
          if (e.translationX >= 50) { onRequestDate(shiftDate(date, -1)); }
          else if (e.translationX <= -50 && !isToday) { onRequestDate(shiftDate(date, 1)); }
        }),
    [date, isToday, onRequestDate],
  );

  const upcomingGroups = useMemo(() => {
    const out: {date: string; items: Entry[]}[] = [];
    for (const e of upcoming) {
      const key = e.scheduled_date ?? '';
      const last = out[out.length - 1];
      if (last && last.date === key) { last.items.push(e); }
      else { out.push({date: key, items: [e]}); }
    }
    return out;
  }, [upcoming]);

  const hasFilterable = dayProjects.length > 0 || dayTags.length > 0;

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View key={date} entering={FadeIn.duration(140)} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            isToday
              ? {paddingTop: shellPad.paddingTop, paddingBottom: shellPad.paddingBottom}
              : styles.detailTopPad,
            noteEditing && kbHeight > 0 && {paddingBottom: kbHeight + spacing.lg},
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          {isToday && (
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <Text style={styles.headerDate}>{formatDate(date)}</Text>
                <DayHoursReadout workSecs={totalSecs} personalSecs={personalSecs} showPersonal={showPersonalHours} />
              </View>
              <Text style={styles.headerSub}>
                {format(new Date(), 'EEEE, MMMM d, yyyy', {
                  locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
                })}
              </Text>
            </View>
          )}
          {hasFilterable && (
            <FilterBar
              projects={dayProjects}
              tags={dayTags}
              selectedProjectId={selectedProjectId}
              selectedTagIds={selectedTagIds}
              onSelectProject={setSelectedProjectId}
              onToggleTag={toggleTag}
              onClear={clearFilters}
            />
          )}
          {isToday && <DayEndConfirmBanner />}
          {isToday && <QuickTimerCard />}
          {day && (
            <DaySummaryCard day={day} entries={allEntries} onUpdateTimes={fields => updateDayTimes(date, fields)} />
          )}
          {day && <DaySplitBar entries={allEntries} />}
          <EntryList inline card entries={filteredEntries} onPressEntry={onOpenEntry} />
          {isToday && upcoming.length > 0 && (
            <View style={styles.comingUp}>
              <Text style={styles.comingUpHeader}>{t('todo.comingUp')}</Text>
              {upcomingGroups.map(group => (
                <View key={group.date}>
                  <Text style={styles.comingUpDate}>{formatDate(group.date)}</Text>
                  {group.items.map(e => (
                    <EntryListItem key={e.id} entry={e} onPress={() => onOpenEntry(e)} />
                  ))}
                </View>
              ))}
            </View>
          )}
          {isToday && (
            <Text style={styles.whereAmI}>{t('location.detected', {place: placeLabel(detected)})}</Text>
          )}
          {day && (
            <SpecialNoteCard
              note={day.notes}
              onSave={notes => updateDayTimes(date, {notes})}
              onBeginEdit={() => setNoteEditing(true)}
              onEndEdit={() => setNoteEditing(false)}
            />
          )}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
```

- [ ] **Step 2: Rewrite `src/screens/HomeScreen.tsx` as a thin Today wrapper**

Replace the entire file with:

```tsx
import React from 'react';
import DayView from '../components/day/DayView';
import {todayDate} from '../utils/dateUtils';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Home'>;

export default function HomeScreen({navigation}: Props) {
  const date = todayDate();
  return (
    <DayView
      variant="today"
      date={date}
      onRequestDate={d => navigation.navigate('DayScreen', {date: d})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
    />
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/components/day/DayView.tsx src/screens/HomeScreen.tsx`
Expected: no output (clean). `DayView`'s `variant="detail"` path is unused so far; that's fine.

- [ ] **Step 4: Commit**

```bash
git add src/components/day/DayView.tsx src/screens/HomeScreen.tsx
git commit -m "refactor: extract shared DayView, render Today tab through it"
```

---

## Task 2: Move day-detail to the root stack; rewrite `DayScreen`; delete `HomeStack`

**Files:**
- Modify: `src/navigation/navigationTypes.ts`
- Modify: `src/screens/DayScreen.tsx` (full rewrite to thin wrapper)
- Modify: `src/screens/DayMapScreen.tsx:21` (prop type)
- Modify: `src/navigation/RootNavigator.tsx` (register `DayScreen`, `DayMap`)
- Modify: `src/navigation/MainTabs.tsx` (Home tab → `HomeScreen`)
- Delete: `src/navigation/HomeStack.tsx`

**Interfaces:**
- Consumes: `DayView` from Task 1.
- Produces: root routes `DayScreen: {date: string}` and `DayMap: {dayId: number; date: string}`; `TabParamList.Home` is now `undefined`.

- [ ] **Step 1: Update `src/navigation/navigationTypes.ts`**

Delete the `HomeStackParamList` block entirely. Add `DayMap` to `RootStackParamList` (below `MainTabs`), change the `Home` tab param, and remove the `HomeStackScreenProps` export. Resulting relevant sections:

```ts
export type RootStackParamList = {
  MainTabs: undefined;
  DayScreen: {date: string};
  DayMap: {dayId: number; date: string};
  EntryDetailScreen: {entryId: number; dayId: number};
  AddEntryModal: {date?: string; dayId: number; entryId?: number};
  QuickAddModal: {date?: string; dayId: number; entryType: EntryType};
  ProjectsScreen: undefined;
  TagsScreen: undefined;
  TagsProjectsSettings: undefined;
  SearchScreen: undefined;
  InterfaceSettings: undefined;
  TrackingSettings: undefined;
  WorkDetailsSettings: undefined;
  DataSettings: undefined;
  QuickAddSettings: undefined;
  LocationSettings: undefined;
  WidgetSettings: undefined;
  TranscriptionSettings: undefined;
  DiagnosticsSettings: undefined;
};

export type TabParamList = {
  Home: undefined;
  Map: undefined;
  Data: undefined;
  Gallery: undefined;
  Calendar: undefined;
  Settings: undefined;
};
```

Also delete the `HomeStackScreenProps` type export at the bottom of the file (the `CompositeScreenProps<... HomeStackParamList ...>` block) and remove the now-unused `NavigatorScreenParams` import if `NavigatorScreenParams` is no longer referenced anywhere in the file.

- [ ] **Step 2: Rewrite `src/screens/DayScreen.tsx` as a thin detail wrapper**

Replace the entire file with:

```tsx
import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, StyleSheet, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format} from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DayView from '../components/day/DayView';
import FAB from '../components/ui/FAB';
import {buildQuickAddActions} from '../components/entries/quickAddActions';
import {useTheme, spacing} from '../theme';
import type {Colors} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Day} from '../types';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'DayScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    headerRight: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: spacing.md},
  });

export default function DayScreen({navigation, route}: Props) {
  const {i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [currentDate, setCurrentDate] = useState(route.params.date);
  const [day, setDay] = useState<Day | null>(null);

  useEffect(() => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const label = format(new Date(y, m - 1, d), 'EEE d MMM', {
      locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
    });
    navigation.setOptions({
      title: label,
      headerRight: () =>
        day ? (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('DayMap', {dayId: day.id, date: currentDate})}
              hitSlop={8}>
              <Icon name="map-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null,
    });
  }, [currentDate, day, navigation, colors.primary, i18n.resolvedLanguage, styles.headerRight]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <DayView
        variant="detail"
        date={currentDate}
        onRequestDate={setCurrentDate}
        onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
        onDayLoaded={setDay}
      />
      <FAB
        onPress={() => { if (day) { navigation.navigate('AddEntryModal', {date: currentDate, dayId: day.id}); } }}
        actions={
          day
            ? buildQuickAddActions(entryType =>
                navigation.navigate('QuickAddModal', {date: currentDate, dayId: day.id, entryType}),
              )
            : undefined
        }
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Update `src/screens/DayMapScreen.tsx` prop type**

At line ~19-21 change the import and `Props` type from the Home stack to the root stack:

```tsx
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'DayMap'>;
```

And update the stale comment on the route wrapper from `HomeStack 'DayMap'` to `root 'DayMap'`.

- [ ] **Step 4: Register `DayScreen` + `DayMap` at root in `src/navigation/RootNavigator.tsx`**

Add imports near the other screen imports:

```tsx
import DayScreen from '../screens/DayScreen';
import DayMapScreen from '../screens/DayMapScreen';
```

Add these two `<Stack.Screen>` entries immediately after the `MainTabs` screen (before `EntryDetailScreen`). `DayScreen` sets its own title dynamically, so it needs no `options`:

```tsx
      <Stack.Screen name="DayScreen" component={DayScreen} />
      <Stack.Screen
        name="DayMap"
        component={DayMapScreen}
        options={{title: t('dayMap.title')}}
      />
```

- [ ] **Step 5: Point the Home tab at `HomeScreen` and delete `HomeStack`**

In `src/navigation/MainTabs.tsx`, replace the `HomeStack` import with `HomeScreen`:

```tsx
import HomeScreen from '../screens/HomeScreen';
```

and change the Home tab screen:

```tsx
      <Tab.Screen name="Home" component={HomeScreen} />
```

Then delete the file:

```bash
git rm src/navigation/HomeStack.tsx
```

- [ ] **Step 6: Typecheck + lint + bundle**

Run:
```bash
npx tsc --noEmit -p tsconfig.json \
  && npx eslint src/navigation/navigationTypes.ts src/navigation/RootNavigator.tsx src/navigation/MainTabs.tsx src/screens/DayScreen.tsx src/screens/DayMapScreen.tsx \
  && npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/kelomit-bundle.js --assets-dest /tmp/kelomit-assets
```
Expected: tsc/eslint clean; bundle ends with "Done writing bundle output". (A pre-existing `whisper.rn` exports warning is unrelated and OK.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move day-detail + DayMap to root stack, drop HomeStack"
```

---

## Task 3: Point Calendar at the root route + simplify NavShell

**Files:**
- Modify: `src/screens/CalendarScreen.tsx:191-196` (`navigateToDay`)
- Modify: `src/navigation/NavShell.tsx`

**Interfaces:**
- Consumes: root `DayScreen: {date}` route from Task 2.

- [ ] **Step 1: Update `navigateToDay` in `src/screens/CalendarScreen.tsx`**

Replace the nested navigation with a direct root push:

```tsx
  const navigateToDay = (date: Date) => {
    navigation.navigate('DayScreen', {date: localDateStr(date)});
  };
```

- [ ] **Step 2: Simplify `src/navigation/NavShell.tsx`**

The Home tab no longer has a nested stack, so drop the hide logic. Replace the file body with:

```tsx
import React from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import TopFeatureBar from './TopFeatureBar';
import BottomPill from './BottomPill';

// Rendered as the tab navigator's tabBar. Both bars are absolutely positioned,
// so this reserves no layout height — the scene fills the screen and the bars
// float over it. Day-detail is a root-stack push that covers these bars, so no
// per-screen hiding is needed here.
export default function NavShell(props: BottomTabBarProps) {
  return (
    <>
      <TopFeatureBar {...props} />
      <BottomPill {...props} />
    </>
  );
}
```

- [ ] **Step 3: Confirm no stray nested day navigations remain**

Run: `rg -n "screen: 'DayScreen'|navigate\('Home', \{" src/`
Expected: no matches. (If any remain, convert them to `navigate('DayScreen', {date})`.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/screens/CalendarScreen.tsx src/navigation/NavShell.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/navigation/NavShell.tsx
git commit -m "refactor: route Calendar day taps to root DayScreen, simplify NavShell"
```

---

## Task 4: Full build gate

**Files:** none (verification only).

- [ ] **Step 1: Full automated gate**

Run:
```bash
npx tsc --noEmit -p tsconfig.json \
  && npx eslint src/ \
  && npx jest --silent \
  && npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/kelomit-bundle.js --assets-dest /tmp/kelomit-assets
```
Expected: tsc clean; eslint clean (pre-existing warnings elsewhere are acceptable, no new errors); 140 tests pass; bundle completes.

- [ ] **Step 2: Confirm `HomeStack.tsx` is gone and unreferenced**

Run: `rg -n "HomeStack" src/`
Expected: no matches.

---

## Task 5: Device verification (manual, on Tommi's device via Metro reload)

**Files:** none. This is the real behavioural gate — no native changes, so Metro reload suffices.

- [ ] **Check 1 — Calendar entry point:** Calendar → tap a past day → the day opens with a native header + back button → press Back → returns to **Calendar** with its scroll position intact.
- [ ] **Check 2 — Today entry point:** Today → swipe right → yesterday opens as a pushed detail → press Back → returns to **Today**.
- [ ] **Check 3 — Hardware back:** repeat Checks 1 & 2 using the Android hardware/gesture back — same destinations.
- [ ] **Check 4 — In-place swipe:** on a detail day, swipe left/right → the date changes in place (title updates, content cross-fades) → Back still returns to the original entry point (Calendar or Today), not each swiped day.
- [ ] **Check 5 — Today-only extras:** Today shows quick-timer (only if a session is running), day-end banner, coming-up to-dos, and the "where am I" line. A past/future day shows none of those — just summary card, split bar, entries, day note.
- [ ] **Check 6 — Filter:** on a day with multiple projects/tags, the FilterBar filters the entry list on both Today and a detail day; clearing restores all.
- [ ] **Check 7 — Detail map button:** the header map icon on a detail day opens that day's `DayMap`; Back returns to the detail day.
- [ ] **Check 8 — Quick-add parity:** Today's pill + (tap = AddEntryModal, hold = dial) and the detail-day FAB both add entries to the correct day.

If any check fails, note it and fix before merging.
