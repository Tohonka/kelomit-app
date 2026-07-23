# Work Hours Reporting Design

Date: 2026-07-23
Status: Approved in chat

## Goal

Add a payroll-ready PDF export to Settings. The user selects any inclusive
start and end dates, one of three report contents, and Finnish or English
independently of the app language.

Reports are local-only, A4 portrait documents using the approved clean-payroll
visual direction: white background, restrained blue accent, compact table,
prominent total hours, page-safe margins, repeated table headers, and page
numbers.

## Settings and export flow

Add a **Reporting** item to the Settings list and a dedicated Reporting screen.
The screen contains:

- Person's name, persisted in the existing settings table.
- Company name, persisted in the existing settings table.
- Inclusive start and end date selectors. The initial default is the current
  calendar month, but any valid range is allowed, such as 26 June through
  25 July.
- Report type:
  1. Daily hours.
  2. Daily hours with note headlines.
  3. Daily hours followed by statistics.
- Report language: Finnish or English. This does not change the UI language.
- Export PDF action.

The export action is unavailable until both names are non-empty and the range
is valid. A range with no reportable work shows a localized error instead of
creating a blank document.

## Report layouts

Every report begins with:

- Company name.
- Person's name.
- Selected date range.
- A prominent total worked-hours value.
- A daily table with `Date | Weekday | Hours`.

Dates with zero worked hours are omitted. Dates, weekdays, headings, durations,
and error messages use the selected report language.

### Type 1: Daily hours

The header and daily three-column table only.

### Type 2: Daily hours and headlines

The Type 1 layout plus eligible entry titles shown as indented rows beneath
their day. Titles wrap rather than clip. Entries without a non-empty title
produce no headline.

### Type 3: Daily hours and statistics

The Type 1 content comes first. Statistics begin on a fresh page after all
timesheet pages and contain:

- Hours by project.
- Hours by tag.
- Untracked work.

Long reports may use more than one timesheet page. Table headings repeat on
continuation pages. Statistics are an additional section, not necessarily
literal page two when the daily table already spans multiple pages.

## Work-hour and privacy rules

The report must use the same shared day-work model as Home and Calendar:
day-leg spans form the baseline, qualifying work outside those spans is added,
and personal time inside them is deducted.

Rules specific to the agreed reporting contract:

- `personal_work` contributes to worked hours. It is a private organizational
  marker only.
- `personal_work` never produces a headline, project allocation, tag
  allocation, or visible personal category. Its time remains part of
  Untracked work.
- An entry assigned to a project whose type is `personal` is treated as
  personal time for hour calculation regardless of its activity marker.
  It produces no headline or statistics allocation.
- Plain `personal` entries and hours are not included as work.
- Pending to-do entries are ignored. Completed to-dos follow the same rules as
  other entries.
- Only `work` entry titles outside Personal projects are eligible headlines.
- Entries without a project remain eligible work, but their time is
  unallocated.

The shared hour calculation must be updated rather than adding a report-only
fork, so Home, Calendar, Stats, and reports cannot disagree about Personal
projects or `personal_work` fallback hours.

## Statistics rules

Project and tag allocations reuse explicit entry duration or from-to duration,
matching the current Stats data source. Only eligible `work` entries outside
Personal projects participate.

- Project allocation is exclusive because an entry has at most one project.
- Tag allocation is non-exclusive: an entry tagged with multiple tags
  contributes its full tracked duration to each, matching current Stats
  behavior.
- Untracked work is based on total worked hours minus uniquely allocated
  eligible tracked work. It includes the day baseline without an allocation,
  entries without a project/tag as applicable, and all `personal_work`.
- The untracked value is clamped at zero when overlapping or duration-only
  entries make explicit allocations exceed the day-work total.
- The tag section is labeled as non-exclusive so its rows are not presented as
  a partition that must sum to the total.

## Architecture

Use the existing database and dependencies:

1. A report query loads days, entries, projects, and tags for the inclusive
   range.
2. A pure TypeScript builder applies the shared work-hour rules and produces a
   serializable report model.
3. A small report-only Finnish/English dictionary formats document text
   without changing global i18n state.
4. A minimal Android native module renders the model with Android
   `PdfDocument` at true A4 dimensions.
5. The PDF is written to the app cache and passed to the existing Android
   document picker for Save As. Cancellation is not an error.

No network service or new PDF dependency is needed.

## Native PDF behavior

The renderer uses deterministic A4 portrait coordinates and performs layout
before drawing so it can:

- Wrap headlines and long project/tag names.
- Start a new page before a row would cross the bottom margin.
- Repeat the compact identity/range header and table column headings on
  continuation pages.
- Place page numbers consistently.
- Start statistics on a new page.
- Avoid orphaned statistics headings at the bottom of a page.

## Errors and data safety

- Validate non-empty trimmed names and `startDate <= endDate` in the UI and
  report builder.
- Reject malformed native report payloads rather than producing a partial PDF.
- Surface localized read, render, and save failures.
- Create no database rows during export.
- Keep the generated file in cache only; the picker copies the selected output.
- Do not include entry bodies, media, locations, personal headlines, or other
  private fields.

## Verification

Development follows test-first implementation.

- Pure builder tests cover arbitrary inclusive ranges, zero-day omission,
  Personal-project normalization, `personal_work`, pending to-dos, headline
  privacy, project/tag allocation, multi-tag behavior, untracked work, and both
  languages.
- Existing hour-calculation tests are extended before the shared calculation
  changes.
- Android tests cover A4 page dimensions, pagination decisions, wrapping, and
  invalid payload handling at the smallest practical boundary.
- TypeScript, Jest, lint, Android unit tests, and a debug build must pass.
- Generate representative Finnish and English sample PDFs, extract text for a
  content sanity check, render every page to PNG, and inspect alignment,
  clipping, page breaks, headers, footers, and legibility.

## Out of scope

- Server-side reports or cloud synchronization.
- Report templates, branding/logo uploads, signatures, approval workflows, or
  email delivery.
- Spreadsheet export changes.
- Custom paper sizes or landscape orientation.
