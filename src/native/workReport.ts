import {NativeModules} from 'react-native';
import type {WorkReportModel} from '../services/workReport';

interface WorkReportNative {
  create(json: string, fileName: string): Promise<string>;
}

const Native = NativeModules.WorkReport as WorkReportNative | undefined;

export async function createNativeWorkReport(
  report: WorkReportModel,
  fileName: string,
): Promise<string> {
  if (!Native?.create) {
    throw new Error('Work report PDF export is unavailable.');
  }
  return Native.create(JSON.stringify(report), fileName);
}
