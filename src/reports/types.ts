import type {Day, Entry, LeaveRange} from '../types/index.ts';

/**
 * The report template contract.
 *
 * THE RULE: the builder does all logic, formatting and localization. The
 * template only interpolates and lays out.
 *
 * A model is JSON-serializable and carries pre-formatted, pre-localized strings
 * ('7h 30m', 'KE 29.7. 2026', 'Työaikaraportti') — never raw numbers, never i18n
 * keys. Raw seconds appear only *alongside* a formatted string where a template
 * needs a proportion (the statistics bars scale against the largest row).
 *
 * A template must never import date-fns or i18next, and must never see a `Day`
 * or an `Entry`. If a template needs a new value, add it to the model in the
 * builder — do not reach for the raw data from `html()`.
 *
 * Everything under src/reports/ is also imported directly by the server, so it
 * must stay free of React Native imports, native modules and DB access.
 */

/** The raw rows a report is built from. Both callers already assemble exactly
 *  this — the phone from op-sqlite, the server from better-sqlite3. */
export interface ReportData {
  days: Day[];
  entries: Entry[];
  leaveRanges: LeaveRange[];
}

/** What the user chose in the export form. */
export interface ReportParams {
  personName: string;
  companyName: string;
  startDate: string;
  endDate: string;
  language: ReportLanguage;
}

export type ReportLanguage = 'fi' | 'en';

// ponytail: build() takes one merged object rather than (data, params). The
// split only pays off once a second template needs *different* params, and
// keeping it merged made the extraction from src/services/workReport.ts a pure
// move with zero call-site churn. Split it when template #2 arrives.
export type ReportInput = ReportData & ReportParams;

export interface ReportTemplate<TModel, TInput extends ReportInput = ReportInput> {
  /** Folder name. Stable — appears in settings and in server query strings. */
  id: string;
  /** i18n key for the picker label. */
  labelKey: string;
  /** Pure. Throws the documented refusal codes ('report_empty', …). */
  build(input: TInput): TModel;
  /** Pure. Body markup only — no <html>, no <style>. */
  html(model: TModel): string;
  /** Static stylesheet for this template. */
  css: string;
  /** Page margin in points, used for both @page and Chromium's margin box. */
  marginPt: number;
  /** Chromium-only page footer. Android's WebView print adapter has no
   *  header/footer hook, so the on-device PDF simply has none. */
  footer?(model: TModel): string;
}
