import {errorCodes, isErrorWithCode, saveDocuments} from '@react-native-documents/picker';
import {getDaysInRange} from '../db/days';
import {getEntriesForDays} from '../db/entries';
import {getLeaveRangesInRange} from '../db/leaveRanges';
import {createNativeWorkReport} from '../native/workReport';
import {
  buildWorkReport,
  type ReportLanguage,
  type WorkReportType,
} from './workReport';

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
): Promise<'saved' | 'cancelled'> {
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

  const fileName = `work-report-${options.startDate}-to-${options.endDate}.pdf`;
  const report = buildWorkReport({...options, days, entries, leaveRanges});
  let outputPath;
  try {
    outputPath = await createNativeWorkReport(report, fileName);
  } catch {
    throw new Error('report_render_failed');
  }
  const sourceUri = outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;

  try {
    const responses = await saveDocuments({
      sourceUris: [sourceUri],
      mimeType: 'application/pdf',
      fileName,
      copy: true,
    });
    if (responses.some(response => response.error !== null)) {
      throw new Error('report_save_failed');
    }
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
      return 'cancelled';
    }
    throw new Error('report_save_failed');
  }
  return 'saved';
}
