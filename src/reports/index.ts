import type {ReportInput, ReportTemplate} from './types.ts';
import {workHoursReport} from './workHours/index.ts';

export * from './types.ts';
export {reportDocument} from './document.ts';
export {esc} from './escape.ts';

/**
 * Every report document the app can export.
 *
 * Add a report by dropping a folder in here that exports a ReportTemplate and
 * listing it below. A *variant* of an existing document (an extra section, a
 * different column set) belongs in that document's own build(), not here — see
 * work-hours' `type` param.
 */
export const REPORTS = [workHoursReport] as const;

export type ReportId = (typeof REPORTS)[number]['id'];

export function getReport(id: string): ReportTemplate<any, ReportInput> {
  const template = REPORTS.find(report => report.id === id);
  if (!template) {
    throw new Error('report_unknown_template');
  }
  return template as unknown as ReportTemplate<any, ReportInput>;
}
