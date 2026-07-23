# Work Hours PDF Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add payroll-ready Finnish and English A4 PDF reports for any user-selected inclusive date range.

**Architecture:** Keep calculation and privacy rules in a pure TypeScript report builder that consumes the same hydrated `Day` and `Entry` models as Calendar/Home. Pass the fully localized serializable report model to one small Android `PdfDocument` bridge, then reuse the existing Android document picker to save the file.

**Tech Stack:** React Native 0.86, TypeScript, Zustand settings table access, op-sqlite, date-fns, Android Kotlin `PdfDocument`, Jest, JUnit.

## Global Constraints

- Android only; A4 portrait pages are exactly 595 x 842 PDF points.
- Do not add a PDF dependency or network service.
- Start/end dates are arbitrary user-selected local dates and inclusive.
- PDF language is Finnish or English independently of UI language.
- Daily columns are exactly `Date | Weekday | Hours`; zero-hour dates are omitted.
- `personal_work` counts as work but exposes no headline, project, tag, or personal category.
- Personal-project entries count as personal time regardless of activity marker and expose no report detail.
- Plain personal data, bodies, media, locations, and pending to-dos are not exported.
- Reports use the approved clean-payroll visual direction.
- Preserve the unrelated `.DS_Store` and existing `.superpowers/` state.
- Work test-first and commit after every task.

---

## File map

**Create**

- `src/services/workReport.ts` - pure report types, localization, aggregation, validation.
- `src/services/workReportExport.ts` - database-to-native export orchestration and Save As.
- `src/native/workReport.ts` - typed React Native bridge.
- `src/screens/settings/ReportingSettings.tsx` - identity, range, language, type, and export UI.
- `__tests__/workReport.test.ts` - reporting rules and localized model tests.
- `__tests__/workReportExport.test.ts` - database/native/save orchestration.
- `__tests__/reportingSettings.test.tsx` - Reporting screen interaction.
- `android/app/src/main/java/com/kelomitapp/reporting/WorkReportLayout.kt` - deterministic pagination and wrapping.
- `android/app/src/main/java/com/kelomitapp/reporting/WorkReportRenderer.kt` - A4 canvas rendering.
- `android/app/src/main/java/com/kelomitapp/reporting/WorkReportModule.kt` - one-method React Native bridge.
- `android/app/src/main/java/com/kelomitapp/reporting/WorkReportPackage.kt` - required manual package registration.
- `android/app/src/test/java/com/kelomitapp/reporting/WorkReportLayoutTest.kt` - layout boundary tests.
- `android/app/src/androidTest/java/com/kelomitapp/reporting/WorkReportRendererTest.kt` - real Android PDF smoke test.

**Modify**

- `src/utils/hoursUtils.ts` - make Personal projects private personal time and count `personal_work` in no-leg fallback.
- `__tests__/hoursUtils.test.ts` - shared calculation contract.
- `src/db/entries.ts` - batch-load fully hydrated entries for a set of day IDs and reuse it in range totals.
- `src/screens/SettingsScreen.tsx` - add Reporting row.
- `src/navigation/navigationTypes.ts` - add Reporting route.
- `src/navigation/RootNavigator.tsx` - register Reporting screen.
- `src/i18n/locales/en.ts` - Reporting UI strings.
- `src/i18n/locales/fi.ts` - Reporting UI strings.
- `android/app/src/main/java/com/kelomitapp/MainApplication.kt` - register `WorkReportPackage`.

---

### Task 1: Make the shared hour model honor the approved privacy semantics

**Files:**

- Modify: `src/utils/hoursUtils.ts`
- Modify: `src/db/entries.ts`
- Test: `__tests__/hoursUtils.test.ts`

**Interfaces:**

- Produces: `entryTrackedSeconds(entry: Entry): number`
- Produces: `getEntriesForDays(dayIds: number[]): Promise<Entry[]>`
- Preserves: `calcDayWorkSecs(day: Day, entries: Entry[]): number`

- [ ] **Step 1: Add failing shared-model tests**

Add these cases to `__tests__/hoursUtils.test.ts` using its existing `makeDay`,
`makeEntry`, `at`, and `H` helpers:

```ts
it('counts personal_work when entries are the only work signal', () => {
  const day = makeDay({});
  const entries = [
    makeEntry({activity_type: 'work', duration_sec: 2 * H}),
    makeEntry({id: 2, activity_type: 'personal_work', duration_sec: H}),
  ];
  expect(calcDayWorkSecs(day, entries)).toBe(3 * H);
});

it('treats a Personal-project interval as personal regardless of marker', () => {
  const day = makeDay({started_at: at(8), ended_at: at(16)});
  const entries = [
    makeEntry({
      activity_type: 'work',
      time_from: at(12),
      time_to: at(13),
      project: {
        id: 9,
        name: 'Private',
        type: 'personal',
        archived: false,
        created_at: at(0),
        updated_at: at(0),
      },
    }),
  ];
  expect(calcDayWorkSecs(day, entries)).toBe(7 * H);
});
```

- [ ] **Step 2: Run the tests and verify both fail for the intended reasons**

Run:

```bash
npx jest __tests__/hoursUtils.test.ts --runInBand
```

Expected: the no-leg test returns `2 * H`; the Personal-project test returns
`8 * H`.

- [ ] **Step 3: Export the existing entry duration helper and normalize activity only inside the day-work model**

In `src/utils/hoursUtils.ts`, rename and export the helper without changing its
guards:

```ts
export function entryTrackedSeconds(entry: Entry): number {
  if (entry.is_todo && !entry.completed_at) { return 0; }
  if (entry.duration_sec != null) { return Math.max(0, entry.duration_sec); }
  if (entry.time_from && entry.time_to) {
    const seconds = differenceInSeconds(parseISO(entry.time_to), parseISO(entry.time_from));
    return seconds > 0 ? seconds : 0;
  }
  return 0;
}
```

Replace internal `entrySeconds` calls with `entryTrackedSeconds`. In the no-leg
branch, use:

```ts
const tracked = calcHourBreakdown(entries);
return {
  baselineSeconds: 0,
  addedWorkSeconds: 0,
  deductedPersonalSeconds: 0,
  workSeconds: tracked.workSeconds + tracked.personalWorkSeconds,
  hasDayLegs: false,
};
```

In the entry loop, derive the effective activity once:

```ts
const activity = e.project?.type === 'personal' ? 'personal' : e.activity_type;
```

Use `activity` in place of `e.activity_type` for work additions and personal
deductions. Keep `personal_work` neutral when a day baseline exists.

- [ ] **Step 4: Add one batch hydrator and make Calendar range totals use it**

In `src/db/entries.ts`, extract the existing project-map code into:

```ts
async function fetchProjectsForRows(rows: RawRow[]): Promise<Map<number, Project>>
```

Then add:

```ts
export async function getEntriesForDays(dayIds: number[]): Promise<Entry[]> {
  if (dayIds.length === 0) { return []; }
  const db = getDB();
  const placeholders = dayIds.map(() => '?').join(',');
  const result = await db.execute(
    `SELECT * FROM entries
      WHERE day_id IN (${placeholders})
      ORDER BY day_id ASC, created_at ASC;`,
    dayIds,
  );
  const rows = (result.rows ?? []) as RawRow[];
  const ids = rows.map(row => row.id as number);
  const [tags, projects] = await Promise.all([
    fetchTagsForEntries(ids),
    fetchProjectsForRows(rows),
  ]);
  return rows.map(row =>
    rowToEntry(
      row,
      tags.get(row.id as number) ?? [],
      projects.get(row.project_id as number) ?? null,
    ),
  );
}
```

Use `fetchProjectsForRows` in `getEntriesForDay`. Replace the raw-entry query in
`getWorkSecondsByDay` with `getEntriesForDays(dayIds)` so Personal project types
are present when `calcDayWorkSecs` runs.

- [ ] **Step 5: Run focused and range-total tests**

Run:

```bash
npx jest __tests__/hoursUtils.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/hoursUtils.ts src/db/entries.ts __tests__/hoursUtils.test.ts
git commit -m "fix(hours): apply personal project semantics consistently"
```

---

### Task 2: Build the private, localized report model

**Files:**

- Create: `src/services/workReport.ts`
- Create: `__tests__/workReport.test.ts`

**Interfaces:**

- Consumes: `entryTrackedSeconds`, `calcDayWorkSecs`
- Produces:

```ts
export type ReportLanguage = 'fi' | 'en';
export type WorkReportType = 'hours' | 'headlines' | 'statistics';

export interface WorkReportInput {
  personName: string;
  companyName: string;
  startDate: string;
  endDate: string;
  language: ReportLanguage;
  type: WorkReportType;
  days: Day[];
  entries: Entry[];
}

export interface WorkReportModel {
  meta: {
    personName: string;
    companyName: string;
    range: string;
    title: string;
    totalLabel: string;
    totalHours: string;
    pageLabel: string;
  };
  columns: {date: string; weekday: string; hours: string};
  days: Array<{
    date: string;
    weekday: string;
    hours: string;
    seconds: number;
    headlines: string[];
  }>;
  statistics: null | {
    title: string;
    byProjectTitle: string;
    byTagTitle: string;
    nonExclusiveNote: string;
    projectRows: Array<{label: string; hours: string; seconds: number}>;
    tagRows: Array<{label: string; hours: string; seconds: number}>;
  };
}

export function buildWorkReport(input: WorkReportInput): WorkReportModel;
```

- [ ] **Step 1: Write failing tests for validation and daily rows**

Create `__tests__/workReport.test.ts` with real `Day`/`Entry` objects and these
assertions:

```ts
expect(() => buildWorkReport({...base, personName: ' '}))
  .toThrow('report_person_required');
expect(() => buildWorkReport({...base, startDate: '2026-07-26', endDate: '2026-07-25'}))
  .toThrow('report_invalid_range');

const report = buildWorkReport({
  ...base,
  startDate: '2026-06-26',
  endDate: '2026-07-25',
  days: [zeroDay, workedDay],
  entries: workedEntries,
});
expect(report.days).toHaveLength(1);
expect(report.days[0].date).toBe('25 Jul 2026');
expect(report.days[0].weekday).toBe('Saturday');
expect(report.days[0].hours).toBe('8:00');
```

- [ ] **Step 2: Run the new test and verify RED**

```bash
npx jest __tests__/workReport.test.ts --runInBand
```

Expected: FAIL because `src/services/workReport.ts` does not exist.

- [ ] **Step 3: Implement validation, inclusive filtering, daily totals, and report-only translations**

Create `src/services/workReport.ts`. Use `date-fns` `format` and `parseISO`
with `enUS`/`fi` locales. Use a fixed dictionary with these exact user-visible
terms:

```ts
const COPY = {
  en: {
    title: 'Work hours report',
    total: 'Total worked',
    date: 'Date',
    weekday: 'Weekday',
    hours: 'Hours',
    statistics: 'Statistics',
    byProject: 'By project',
    byTag: 'By tag',
    untracked: 'Untracked work',
    nonExclusive: 'Tag totals are non-exclusive.',
    page: 'Page',
  },
  fi: {
    title: 'Työaikaraportti',
    total: 'Tunteja yhteensä',
    date: 'Päivä',
    weekday: 'Viikonpäivä',
    hours: 'Tunnit',
    statistics: 'Tilastot',
    byProject: 'Projekteittain',
    byTag: 'Tunnisteittain',
    untracked: 'Kohdistamaton työ',
    nonExclusive: 'Tunnisteiden tunnit eivät sulje toisiaan pois.',
    page: 'Sivu',
  },
} as const;
```

Format every duration as `H:MM`. Group entries by `day_id`, normalize the range
with string comparison on ISO local dates, call `calcDayWorkSecs`, and omit
non-positive days.

- [ ] **Step 4: Add failing privacy and headline tests**

Add a worked day containing:

- titled `work` entry without a project;
- titled `personal_work` entry;
- titled `personal` entry;
- titled `work` entry in a Personal project;
- pending titled `work` to-do;
- completed titled `work` to-do.

Assert:

```ts
expect(report.days[0].headlines).toEqual([
  'Client call',
  'Completed task',
]);
expect(JSON.stringify(report)).not.toContain('Doctor');
expect(JSON.stringify(report)).not.toContain('Private project');
```

Run the test and expect it to fail because headline filtering is not present.

- [ ] **Step 5: Implement headline filtering**

For `type === 'headlines'`, include only trimmed, non-empty titles satisfying:

```ts
entry.activity_type === 'work' &&
entry.project?.type !== 'personal' &&
(!entry.is_todo || entry.completed_at != null)
```

Sort titles by `time_from ?? created_at`, then entry ID for stability. Other
report types return empty headline arrays.

- [ ] **Step 6: Add failing allocation tests**

Build a 10-hour report with:

- 3 hours in Work Project A tagged `Customer` and `Urgent`;
- 2 hours of eligible unprojected/untagged work;
- 1 hour marked `personal_work`;
- a Personal-project entry that the daily model excludes;
- 4 baseline hours without explicit entries.

Assert the statistics report has:

```ts
expect(report.statistics!.projectRows.map(row => [row.label, row.seconds])).toEqual([
  ['Project A', 3 * H],
  ['Untracked work', 7 * H],
]);
expect(report.statistics!.tagRows.map(row => [row.label, row.seconds])).toEqual([
  ['Customer', 3 * H],
  ['Urgent', 3 * H],
  ['Untracked work', 7 * H],
]);
```

Run and expect failure because statistics are not implemented.

- [ ] **Step 7: Implement statistics with unique remainder accounting**

Only allocate `entryTrackedSeconds(entry)` from eligible `work` entries outside
Personal projects. Group full seconds by project and by tag. Compute:

```ts
projectUntracked = Math.max(
  0,
  totalSeconds - sum(seconds for eligible entries with a project),
);
tagUntracked = Math.max(
  0,
  totalSeconds - sum(seconds once for eligible entries with at least one tag),
);
```

Append the localized Untracked work row when positive. Sort named rows by
seconds descending, then localized label; keep Untracked last. Return
`statistics: null` for the other report types.

- [ ] **Step 8: Add Finnish assertions and run the focused suite**

Assert Finnish weekday/month forms and all fixed copy without changing global
i18n. Run:

```bash
npx jest __tests__/workReport.test.ts __tests__/hoursUtils.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/services/workReport.ts __tests__/workReport.test.ts
git commit -m "feat(reporting): build private work report model"
```

---

### Task 3: Render deterministic A4 PDFs with the Android platform

**Files:**

- Create: `android/app/src/main/java/com/kelomitapp/reporting/WorkReportLayout.kt`
- Create: `android/app/src/main/java/com/kelomitapp/reporting/WorkReportRenderer.kt`
- Create: `android/app/src/main/java/com/kelomitapp/reporting/WorkReportModule.kt`
- Create: `android/app/src/main/java/com/kelomitapp/reporting/WorkReportPackage.kt`
- Create: `android/app/src/test/java/com/kelomitapp/reporting/WorkReportLayoutTest.kt`
- Modify: `android/app/src/main/java/com/kelomitapp/MainApplication.kt`

**Interfaces:**

- Consumes: JSON serialization of `WorkReportModel`
- Produces native module:

```kotlin
@ReactMethod
fun create(json: String, fileName: String, promise: Promise)
```

- Produces JS result: absolute cached PDF path

- [ ] **Step 1: Write failing layout tests**

Create `WorkReportLayoutTest.kt` around a pure layout object with constants:

Use a tiny measurement function instead of Android `Paint` in the JVM test:

```kotlin
assertEquals(595, WorkReportLayout.PAGE_WIDTH)
assertEquals(842, WorkReportLayout.PAGE_HEIGHT)
assertEquals(
  listOf("alpha", "beta", "gamma"),
  WorkReportLayout.wrap("alpha beta gamma", 5f) { it.length.toFloat() },
)
assertTrue(WorkReportLayout.needsPageBreak(currentY = 790f, blockHeight = 30f))
assertFalse(WorkReportLayout.needsPageBreak(currentY = 700f, blockHeight = 30f))

fun wrap(text: String, maxWidth: Float, measure: (String) -> Float): List<String>
```

Run:

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests '*WorkReportLayoutTest'
```

Expected: FAIL because `WorkReportLayout` does not exist.

- [ ] **Step 2: Implement only the pure layout boundary**

`WorkReportLayout` owns A4 dimensions, margins, footer boundary, word wrapping,
and `needsPageBreak`. It does not own colors, translations, database access, or
React Native.

Use:

```kotlin
const val PAGE_WIDTH = 595
const val PAGE_HEIGHT = 842
const val MARGIN = 42f
const val FOOTER_TOP = 806f

fun needsPageBreak(currentY: Float, blockHeight: Float): Boolean =
  currentY + blockHeight > FOOTER_TOP
```

Implement greedy whitespace wrapping; if one word exceeds `maxWidth`, split it
at the longest character prefix that fits so rendering cannot clip.

- [ ] **Step 3: Run the layout test GREEN**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests '*WorkReportLayoutTest'
```

Expected: PASS.

- [ ] **Step 4: Implement the renderer**

`WorkReportRenderer.render(context, json, fileName): File` must:

1. Parse the required `meta`, `columns`, `days`, and optional `statistics`
   objects with `org.json`.
2. Reject missing/blank identity, empty days, negative seconds, and unsafe
   filenames using `require`.
3. Create `PdfDocument.PageInfo.Builder(595, 842, pageNumber)`.
4. Draw dark navy text, pale blue table headings, blue accent rule, and the
   prominent total block using `Paint`.
5. Draw `Date | Weekday | Hours`, with hours right-aligned.
6. Wrap and indent headline rows.
7. Start a page before a row crosses `FOOTER_TOP`; repeat compact report
   identity/range plus column headings.
8. For statistics, finish the current page and start a fresh page; render
   project and tag rows with proportional blue bars and the non-exclusive note.
9. Draw `"<pageLabel> N"` in the footer of every page.
10. Write atomically to `context.cacheDir/fileName` via a temporary file, then
    rename.
11. Close `PdfDocument` and streams in `finally`.

- [ ] **Step 5: Add the minimal React Native bridge and package**

`WorkReportModule` validates:

```kotlin
require(fileName.matches(Regex("""work-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf""")))
```

It calls the renderer on a single background executor, resolves the absolute
path, rejects with `report_pdf_failed`, and shuts the executor down in
`invalidate()`.

`WorkReportPackage` follows the existing `BackgroundLocationPackage` manual
registration pattern. Add `WorkReportPackage()` to `MainApplication` beside the
other manually registered packages.

- [ ] **Step 6: Compile and run native unit tests**

```bash
cd android && ./gradlew :app:testDebugUnitTest :app:compileDebugKotlin
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/kelomitapp/MainApplication.kt \
  android/app/src/main/java/com/kelomitapp/reporting \
  android/app/src/test/java/com/kelomitapp/reporting
git commit -m "feat(reporting): render native A4 work reports"
```

---

### Task 4: Connect report data, native rendering, and Android Save As

**Files:**

- Create: `src/native/workReport.ts`
- Create: `src/services/workReportExport.ts`
- Test: `__tests__/workReportExport.test.ts`

**Interfaces:**

- Consumes: `getDaysInRange`, `getEntriesForDays`, `buildWorkReport`
- Produces:

```ts
export interface ExportWorkReportOptions {
  personName: string;
  companyName: string;
  startDate: string;
  endDate: string;
  language: ReportLanguage;
  type: WorkReportType;
}

export async function exportWorkReport(
  options: ExportWorkReportOptions,
): Promise<'saved' | 'cancelled'>;
```

- [ ] **Step 1: Write a failing orchestration test**

Mock only the database boundary, native bridge, and document picker. Assert:

```ts
expect(getDaysInRange).toHaveBeenCalledWith('2026-06-26', '2026-07-25');
expect(getEntriesForDays).toHaveBeenCalledWith([1, 2]);
expect(createNativeWorkReport).toHaveBeenCalledWith(
  expect.objectContaining({days: expect.any(Array)}),
  'work-report-2026-06-26-to-2026-07-25.pdf',
);
expect(saveDocuments).toHaveBeenCalledWith({
  sourceUris: ['file:///cache/work-report.pdf'],
  mimeType: 'application/pdf',
  fileName: 'work-report-2026-06-26-to-2026-07-25.pdf',
  copy: true,
});
```

Add a second test asserting picker cancellation returns `'cancelled'`.

- [ ] **Step 2: Run the test RED**

```bash
npx jest __tests__/workReportExport.test.ts --runInBand
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the typed native wrapper**

In `src/native/workReport.ts`, require `NativeModules.WorkReport` and expose:

```ts
export async function createNativeWorkReport(
  report: WorkReportModel,
  fileName: string,
): Promise<string> {
  if (!Native?.create) {
    throw new Error('Work report PDF export is unavailable.');
  }
  return Native.create(JSON.stringify(report), fileName);
}
```

- [ ] **Step 4: Implement export orchestration**

Load days once, hydrate all entries with one batch call, build the model, call
native rendering, and then call the existing `saveDocuments` API with
`application/pdf`. Treat only `errorCodes.OPERATION_CANCELED` as cancellation;
rethrow every read/build/render/save failure.

- [ ] **Step 5: Run the focused tests GREEN**

```bash
npx jest __tests__/workReport.test.ts __tests__/workReportExport.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/native/workReport.ts src/services/workReportExport.ts \
  __tests__/workReportExport.test.ts
git commit -m "feat(reporting): export reports through Android Save As"
```

---

### Task 5: Add the Reporting settings screen

**Files:**

- Create: `src/screens/settings/ReportingSettings.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/navigationTypes.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fi.ts`
- Test: `__tests__/reportingSettings.test.tsx`

**Interfaces:**

- Consumes: `getSetting`, `setSetting`, `exportWorkReport`
- Persists keys: `report_person_name`, `report_company_name`

- [ ] **Step 1: Write the failing screen test**

Using `react-test-renderer`, mock `getSetting`, `setSetting`, and
`exportWorkReport`. Assert the screen:

```ts
expect(textInputs()).toHaveLength(2);
expect(button('Export PDF').props.disabled).toBe(true);
```

After entering trimmed names and choosing dates, assert:

```ts
expect(setSetting).toHaveBeenCalledWith('report_person_name', 'Matti Meikäläinen');
expect(setSetting).toHaveBeenCalledWith('report_company_name', 'Kelo Design Oy');
expect(exportWorkReport).toHaveBeenCalledWith({
  personName: 'Matti Meikäläinen',
  companyName: 'Kelo Design Oy',
  startDate: '2026-06-26',
  endDate: '2026-07-25',
  language: 'fi',
  type: 'hours',
});
```

- [ ] **Step 2: Run the screen test RED**

```bash
npx jest __tests__/reportingSettings.test.tsx --runInBand
```

Expected: FAIL because `ReportingSettings` does not exist.

- [ ] **Step 3: Implement the screen using existing settings patterns**

Use `SafeAreaView`, `ScrollView`, `makeSettingsStyles`, the existing theme, and
`DateTimePicker`. Keep only screen-local state:

```ts
const [personName, setPersonName] = useState('');
const [companyName, setCompanyName] = useState('');
const [startDate, setStartDate] = useState(startOfMonth(new Date()));
const [endDate, setEndDate] = useState(new Date());
const [language, setLanguage] = useState<ReportLanguage>('fi');
const [type, setType] = useState<WorkReportType>('hours');
const [busy, setBusy] = useState(false);
```

Load the two identity keys with `Promise.all`. Save each trimmed field on blur.
Use accessible labels for the two date buttons, language choices, report-type
choices, and export action. Prevent repeated export while busy.

Report type labels:

- English: `Daily hours`, `Hours and headlines`, `Hours and statistics`
- Finnish: `Päivittäiset tunnit`, `Tunnit ja otsikot`, `Tunnit ja tilastot`

On error, map builder codes to localized messages and otherwise display the
existing localized export-failure prefix plus the error text. Picker
cancellation shows no alert.

- [ ] **Step 4: Register navigation and UI translations**

Add `ReportingSettings: undefined` to `RootStackParamList`, import/register the
screen in `RootNavigator`, and add this Settings row immediately before Data:

```ts
{
  key: 'ReportingSettings',
  titleKey: 'reporting.title',
  subtitleKey: 'reporting.subtitle',
}
```

Add matching `reporting` translation objects to both locale files for every
label, validation error, busy state, and empty-report error used by the screen.

- [ ] **Step 5: Run the focused screen and report tests**

```bash
npx jest __tests__/reportingSettings.test.tsx \
  __tests__/workReport.test.ts \
  __tests__/workReportExport.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/settings/ReportingSettings.tsx src/screens/SettingsScreen.tsx \
  src/navigation/navigationTypes.ts src/navigation/RootNavigator.tsx \
  src/i18n/locales/en.ts src/i18n/locales/fi.ts \
  __tests__/reportingSettings.test.tsx
git commit -m "feat(settings): add work report export"
```

---

### Task 6: Produce and visually verify real Finnish and English PDFs

**Files:**

- Create: `android/app/src/androidTest/java/com/kelomitapp/reporting/WorkReportRendererTest.kt`
- Temporary only: `tmp/pdfs/`

**Interfaces:**

- Consumes: `WorkReportRenderer.render`
- Produces test cache files: `work-report-sample-en.pdf`,
  `work-report-sample-fi.pdf`

- [ ] **Step 1: Add a real-device renderer smoke test**

Create an instrumentation test that renders:

- English hours-with-headlines data long enough to span two timesheet pages.
- Finnish statistics data with `ä`, `ö`, long project/tag labels, untracked
  rows, and a statistics page.

For each PDF, open it with Android `PdfRenderer` and assert:

```kotlin
assertTrue(file.length() > 1_000)
assertTrue(renderer.pageCount >= expectedMinimumPages)
renderer.openPage(0).use { page ->
  assertEquals(595, page.width)
  assertEquals(842, page.height)
}
```

Leave the two sample files in target-app cache for extraction after the test.

- [ ] **Step 2: Run the instrumentation test**

With an emulator or connected debug-capable Android device:

```bash
adb devices
cd android && ./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.kelomitapp.reporting.WorkReportRendererTest
```

Expected: both tests PASS.

- [ ] **Step 3: Pull, inspect, and render both PDFs**

```bash
mkdir -p tmp/pdfs
adb exec-out run-as com.kelomitapp cat cache/work-report-sample-en.pdf \
  > tmp/pdfs/work-report-sample-en.pdf
adb exec-out run-as com.kelomitapp cat cache/work-report-sample-fi.pdf \
  > tmp/pdfs/work-report-sample-fi.pdf
pdfinfo tmp/pdfs/work-report-sample-en.pdf
pdfinfo tmp/pdfs/work-report-sample-fi.pdf
pdftotext tmp/pdfs/work-report-sample-en.pdf -
pdftotext tmp/pdfs/work-report-sample-fi.pdf -
pdftoppm -png tmp/pdfs/work-report-sample-en.pdf tmp/pdfs/en
pdftoppm -png tmp/pdfs/work-report-sample-fi.pdf tmp/pdfs/fi
```

Inspect every generated PNG for clipping, overlap, wrapping, table continuation,
statistics page separation, Finnish glyphs, margins, and footer placement.

- [ ] **Step 4: Fix visual defects test-first**

For each defect, first add the smallest failing `WorkReportLayoutTest` assertion
that captures its boundary, run it RED, change the layout/renderer, rerun GREEN,
then repeat the render inspection.

- [ ] **Step 5: Commit the retained instrumentation check**

Do not commit PDFs or PNGs.

```bash
git add android/app/src/androidTest/java/com/kelomitapp/reporting/WorkReportRendererTest.kt \
  android/app/src/main/java/com/kelomitapp/reporting \
  android/app/src/test/java/com/kelomitapp/reporting
git commit -m "test(reporting): verify rendered A4 PDFs"
```

---

### Task 7: Full regression verification and handoff

**Files:**

- Verify all changed files
- Do not modify `realUserData`

- [ ] **Step 1: Run JavaScript checks**

```bash
npx tsc --noEmit
npm test -- --runInBand
npx eslint src/services/workReport.ts src/services/workReportExport.ts \
  src/native/workReport.ts src/screens/settings/ReportingSettings.tsx \
  src/utils/hoursUtils.ts src/db/entries.ts \
  src/screens/SettingsScreen.tsx src/navigation/navigationTypes.ts \
  src/navigation/RootNavigator.tsx src/i18n/locales/en.ts src/i18n/locales/fi.ts \
  __tests__/workReport.test.ts __tests__/workReportExport.test.ts \
  __tests__/reportingSettings.test.tsx --max-warnings=0
```

Expected: all commands PASS with zero warnings in changed files.

- [ ] **Step 2: Run Android checks and build**

```bash
cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Expected: BUILD SUCCESSFUL and
`android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Check the patch and repository scope**

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no uncommitted reporting files; only the user's pre-existing
`.DS_Store` and `.superpowers/` state may remain outside the commits.

- [ ] **Step 4: Finish the branch**

Use `superpowers:verification-before-completion`, then
`superpowers:finishing-a-development-branch`. Report automated verification and
separately state whether real-device Save As and PDF inspection were completed.
