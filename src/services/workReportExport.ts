import {getDaysInRange} from '../db/days';
import {getEntriesForDays} from '../db/entries';
import {getLeaveRangesInRange} from '../db/leaveRanges';
import {createNativeWorkReport} from '../native/workReport';
import {reportDocument} from '../reports/document';
import {workHoursReport} from '../reports/workHours';
import type {ReportLanguage, WorkReportType} from '../reports/workHours/build';

export interface ExportWorkReportOptions {
  personName: string;
  companyName: string;
  startDate: string;
  endDate: string;
  language: ReportLanguage;
  type: WorkReportType;
}

/**
 * Builds the work-hours report and opens Android's print UI for it.
 *
 * Saving is the print framework's job now — it offers "Save as PDF" and asks
 * for a destination — so there is no Save-As step here and no path to hand back.
 */
export async function exportWorkReport(
  options: ExportWorkReportOptions,
): Promise<void> {
  let days;
  let entries;
  let leaveRanges;
  try {
    days = await getDaysInRange(options.startDate, options.endDate);
    [entries, leaveRanges] = await Promise.all([
      getEntriesForDays(days.map(day => day.id)),
      getLeaveRangesInRange(options.startDate, options.endDate),
    ]);
  } catch {
    throw new Error('report_read_failed');
  }

  // Outside the try below: the builder's refusals (report_empty,
  // report_person_required, …) are their own error codes and must reach the UI
  // unchanged rather than collapsing into report_render_failed.
  const fileName = `work-report-${options.startDate}-to-${options.endDate}.pdf`;
  const model = workHoursReport.build({...options, days, entries, leaveRanges});

  try {
    await createNativeWorkReport(
      // WebView applies no page margin of its own — see reportDocument().
      reportDocument(workHoursReport, model, {pageMargin: true}),
      fileName,
      workHoursReport.marginPt,
    );
  } catch {
    throw new Error('report_render_failed');
  }
}
