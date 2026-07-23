# Current-Day Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Home, Today map, and global Quick Add resolve the actual current local day on every relevant user action without restarting the app.

**Architecture:** Make `dayStore.loadToday()` recompute and return the current day, distinguish cached rendering from explicit refresh, emit proper tab-press events from the custom tab bar, and resolve Quick Add's `{date, dayId}` atomically at press time.

**Tech Stack:** React Native, React Navigation 7, Zustand, TypeScript, date-fns, Jest.

## Global Constraints

- Home refreshes on mount, focus, every Home-icon press, and foreground resume.
- An already-mounted Home tab must roll over at midnight.
- Explicit refresh rereads SQLite even if a cached day exists.
- Global Quick Add resolves both date and day ID at press time.
- Historical-day Quick Add retains its explicit target unchanged.
- Do not clear unrelated caches or recreate the navigation tree.

---

### Task 1: Make current-day resolution atomic and refreshable

**Files:**
- Modify: `src/store/dayStore.ts`
- Create: `__tests__/dayStoreRollover.test.ts`

**Interfaces:**
- Changes `loadToday(): Promise<Day>`.
- Changes `loadDay(date, options?: {refresh?: boolean}): Promise<Day>`.
- Consumed by Home, Map, and Quick Add in Task 2.

- [ ] **Step 1: Write failing store tests**

Mock `date-fns.format`, `getOrCreateDay`, and `getDayByDate`. Test:

```typescript
beforeEach(() => {
  useDayStore.setState({
    today: null,
    selectedDay: null,
    daysCache: {},
    isLoading: false,
    error: null,
  });
  jest.clearAllMocks();
});

test('loadToday replaces yesterday after midnight', async () => {
  format.mockReturnValue('2026-07-22');
  getOrCreateDay.mockResolvedValue(day(22, '2026-07-22'));
  await useDayStore.getState().loadToday();

  format.mockReturnValue('2026-07-23');
  getOrCreateDay.mockResolvedValue(day(23, '2026-07-23'));
  const current = await useDayStore.getState().loadToday();

  expect(current.date).toBe('2026-07-23');
  expect(useDayStore.getState().today?.id).toBe(23);
});

test('explicit loadDay refresh bypasses cache', async () => {
  useDayStore.setState({daysCache: {'2026-07-23': day(23, '2026-07-23', null)}});
  getDayByDate.mockResolvedValue(day(23, '2026-07-23', '2026-07-23T06:00:00Z'));
  const fresh = await useDayStore.getState().loadDay('2026-07-23', {refresh: true});
  expect(getDayByDate).toHaveBeenCalledWith('2026-07-23');
  expect(fresh.started_at).toBe('2026-07-23T06:00:00Z');
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/dayStoreRollover.test.ts
```

- [ ] **Step 3: Implement the minimal store changes**

`loadToday` recomputes `format(new Date(), 'yyyy-MM-dd')`, loads the DB row,
updates `today` and cache, then returns the row. Preserve the existing loading
and error state behavior; in the catch branch, set `error`, clear `isLoading`,
and rethrow so the promised `Day` is never silently replaced with `undefined`.

`loadDay` behavior:

```typescript
loadDay: async (date, options) => {
  if (!options?.refresh) {
    const cached = get().daysCache[date];
    if (cached) {
      set({selectedDay: cached});
      return cached;
    }
  }
  let day = options?.refresh ? await getDayByDate(date) : null;
  if (!day) {
    day = await getOrCreateDay(date);
  }
  set(state => ({
    selectedDay: day,
    today: state.today?.date === date ? day : state.today,
    daysCache: {...state.daysCache, [date]: day},
  }));
  return day;
},
```

If refresh finds no existing row, create it.

- [ ] **Step 4: Run GREEN**

Run the Task 1 test and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/store/dayStore.ts __tests__/dayStoreRollover.test.ts
git commit -m "fix(days): refresh the actual current day"
```

---

### Task 2: Refresh Home/Map and resolve Quick Add on press

**Files:**
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/components/day/DayView.tsx`
- Modify: `src/screens/MapTab.tsx`
- Modify: `src/navigation/NavShell.tsx`
- Modify: `src/navigation/BottomPill.tsx`
- Modify: `src/navigation/QuickAddButton.tsx`
- Create: `__tests__/quickAddDay.test.ts`

**Interfaces:**
- Consumes Task 1 `loadToday(): Promise<Day>`.
- Custom tab bar emits React Navigation `tabPress`.
- Quick Add navigates with matching `{date, dayId}`.

- [ ] **Step 1: Write RED Quick Add target test**

Extract one exported helper from `QuickAddButton.tsx`:

```typescript
export async function resolveQuickAddDay(
  target: {date: string; dayId: number} | undefined,
  loadToday: () => Promise<Day>,
): Promise<{date: string; dayId: number}> {
  if (target) return target;
  const day = await loadToday();
  return {date: day.date, dayId: day.id};
}
```

Test that a cached July 21 state is irrelevant when `loadToday` returns July 22,
and that an explicit historical target never calls `loadToday`.

- [ ] **Step 2: Run RED**

```bash
npm test -- --runInBand __tests__/quickAddDay.test.ts
```

- [ ] **Step 3: Emit real tab-press events**

In `NavShell`, resolve the route object and follow React Navigation's custom-tab
contract:

```typescript
const select = (name: PillRoute) => {
  const route = state.routes.find(r => r.name === name);
  if (!route) return;
  const event = navigation.emit({
    type: 'tabPress',
    target: route.key,
    canPreventDefault: true,
  });
  if (!event.defaultPrevented) {
    navigation.navigate(name);
  }
};
```

Pass `select` to `BottomPill`. Do not remount the navigator.

- [ ] **Step 4: Make Home own a live date**

`HomeScreen` stores `date` in state. One `refreshToday` callback awaits
`loadToday`, updates the date from the returned row, and calls
`loadEntriesForDay(day.id)`.
Invoke it from:

- `useFocusEffect`;
- `navigation.addListener('tabPress', ...)` only when `navigation.isFocused()`
  (focus handles navigation from another tab);
- `AppState` active listener.

Pass the live state date to `DayView`.

`useFocusEffect` covers the initial mounted focus, so do not add a second
mount-only DB refresh.

- [ ] **Step 5: Make DayView focus refresh actually hit SQLite**

Keep the generic date-change load for detail screens. In the Today-only focus
effect, remove the stale `loadDay(date)` call and retain only upcoming-item
refresh. Remove the foreground listener from `DayView` once Home owns it,
avoiding duplicate lifecycle handlers.

- [ ] **Step 6: Refresh Today map on focus**

Use `useFocusEffect` to await `loadToday` every time the Map tab focuses. Do not
load only when `today` is null.

- [ ] **Step 7: Resolve Quick Add at press time**

Make `go` and `openAdd` async:

```typescript
const {date, dayId} = await resolveQuickAddDay(target, loadToday);
navigation.navigate('AddEntryModal', {dayId, date});
```

Use the same pair for `QuickAddModal`. Disable repeat taps while resolving so
one press cannot open duplicate modals.

- [ ] **Step 8: Run GREEN**

```bash
npm test -- --runInBand __tests__/dayStoreRollover.test.ts __tests__/quickAddDay.test.ts
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/screens/HomeScreen.tsx src/components/day/DayView.tsx src/screens/MapTab.tsx src/navigation/NavShell.tsx src/navigation/BottomPill.tsx src/navigation/QuickAddButton.tsx __tests__/quickAddDay.test.ts
git commit -m "fix(days): roll Home and quick add over at midnight"
```

---

### Task 3: Full current-day verification

**Files:**
- None. This task records verification evidence only.

- [ ] **Step 1: Run automated checks**

```bash
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm test -- --runInBand
```

- [ ] **Step 2: Manual rollover scenarios**

Using a debug clock/test seam or a controlled device date:

1. leave Home mounted on day N;
2. advance to day N+1;
3. press the already-selected Home icon;
4. verify header, hours, entries, and new note all use N+1;
5. repeat by backgrounding across midnight;
6. open global Quick Add from Calendar/Settings and verify N+1;
7. open explicit day-detail Quick Add and verify the historical date remains.

- [ ] **Step 3: Check the supplied regression evidence**

Query the backup read-only to retain the regression example: an entry created
July 22 was attached to July 21. Do not edit or import `realUserData`.

- [ ] **Step 4: Diff check**

```bash
git diff --check
git status --short
```

Expected: checks pass and the pre-existing `.DS_Store` remains untouched.

- [ ] **Step 5: Handle a failed check without broadening this task**

If any automated or manual check fails, stop this verification task, add a
new corrective task naming the exact production and test files, complete its
RED/GREEN/commit cycle, then restart Task 3 from Step 1. Do not edit files
under this verification-only task.
