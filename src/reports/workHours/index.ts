import type {ReportTemplate} from '../types.ts';
import {buildWorkReport, type WorkReportInput, type WorkReportModel} from './build.ts';
import {PAGE_MARGIN_PT, SHEET_CSS} from './css.ts';
import {footerTemplate, sheetHtml} from './html.ts';

// NOTE: only *concrete* value exports belong in this file. `src/` is CommonJS
// (the app package has no "type": "module") while `server/` is ESM, so when the
// server named-imports from here Node analyses it with cjs-module-lexer — and
// the lexer cannot see through `export * from …` chains. A star re-export here
// silently yields "does not provide an export named …" at server startup.
// Import concrete files instead; that is what the server does.
export const workHoursReport: ReportTemplate<WorkReportModel, WorkReportInput> = {
  id: 'work-hours',
  labelKey: 'reporting.templateWorkHours',
  build: buildWorkReport,
  html: sheetHtml,
  css: SHEET_CSS,
  marginPt: PAGE_MARGIN_PT,
  footer: footerTemplate,
};

// Types erase at runtime, so re-exporting them costs the lexer nothing.
export type {WorkReportInput, WorkReportModel};
export type {ReportLanguage, WorkReportType} from './build.ts';
