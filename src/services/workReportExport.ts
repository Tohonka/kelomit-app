import {errorCodes, isErrorWithCode, saveDocuments} from '@react-native-documents/picker';
import {getDaysInRange} from '../db/days';
import {getEntriesForDays} from '../db/entries';
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
  const days = await getDaysInRange(options.startDate, options.endDate);
  const entries = await getEntriesForDays(days.map(day => day.id));
  const fileName = `work-report-${options.startDate}-to-${options.endDate}.pdf`;
  const outputPath = await createNativeWorkReport(
    buildWorkReport({...options, days, entries}),
    fileName,
  );
  const sourceUri = outputPath.startsWith('file://') ? outputPath : `file://${outputPath}`;

  try {
    await saveDocuments({
      sourceUris: [sourceUri],
      mimeType: 'application/pdf',
      fileName,
      copy: true,
    });
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
      return 'cancelled';
    }
    throw error;
  }
  return 'saved';
}
