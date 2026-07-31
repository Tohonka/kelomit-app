import {NativeModules} from 'react-native';

interface WorkReportNative {
  create(html: string, fileName: string, marginPt: number): Promise<void>;
}

const Native = NativeModules.WorkReport as WorkReportNative | undefined;

/**
 * Renders a report document and hands it to Android's print UI, where the user
 * picks "Save as PDF" and a destination.
 *
 * Resolves once the print job is submitted — not when the user has saved it.
 * Android does not surface that without polling the job, and nothing acts on it.
 *
 * `html` must be a complete, self-contained document: the native side loads it
 * with a null base URL, so nothing external resolves. Build it with
 * `reportDocument()` from src/reports.
 */
export async function createNativeWorkReport(
  html: string,
  fileName: string,
  marginPt: number,
): Promise<void> {
  if (!Native?.create) {
    throw new Error('Work report PDF export is unavailable.');
  }
  await Native.create(html, fileName, marginPt);
}
