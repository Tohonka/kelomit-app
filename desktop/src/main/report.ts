import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type Database from 'better-sqlite3';
import {openCurrent} from '../../../server/src/db.ts';
import {
  getDaysInRange,
  getEntriesInRange,
  getLeaveRangesInRange,
  getSetting,
} from '../../../server/src/queries.ts';
import {reportDocument} from '../../../src/reports/document.ts';
import {workHoursReport} from '../../../src/reports/workHours/index.ts';
import {buildWorkReport} from '../../../src/reports/workHours/build.ts';
import type {ReportLanguage, WorkReportModel, WorkReportType} from '../../../src/reports/workHours/build.ts';

/**
 * The work-hours report as a one-click PDF. Same model + template as the phone
 * and the server (`src/reports`), printed by Electron's own Chromium — the
 * thing the server needed a 700 MB Chromium image for.
 */
export interface ReportParams {
  from: string;
  to: string;
  person: string;
  company: string;
  type: WorkReportType;
  language: ReportLanguage;
}

export type ReportResult = {ok: true; path: string} | {ok: false; error: string} | {ok: false; cancelled: true};

/** `buildWorkReport` refuses with the app's own i18n keys. */
const ERRORS: Record<string, string> = {
  report_person_required: 'Enter a name.',
  report_company_required: 'Enter a company.',
  report_invalid_range: 'The start date is after the end date.',
  report_empty: 'No worked hours in that range.',
};

function monthRange(): {from: string; to: string} {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))),
    to: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))),
  };
}

export function reportDefaults(db: Database.Database | null): ReportParams {
  return {
    ...monthRange(),
    person: (db && getSetting(db, 'report_person_name')) ?? '',
    company: (db && getSetting(db, 'report_company_name')) ?? '',
    type: 'hours',
    language: 'fi',
  };
}

/** Synchronous on purpose: the db handle must not be held across an await. */
export function buildModel(db: Database.Database, p: ReportParams): WorkReportModel {
  return buildWorkReport({
    personName: p.person,
    companyName: p.company,
    startDate: p.from,
    endDate: p.to,
    language: p.language,
    type: p.type,
    days: getDaysInRange(db, p.from, p.to),
    entries: getEntriesInRange(db, p.from, p.to),
    leaveRanges: getLeaveRangesInRange(db, p.from, p.to),
  });
}

export async function renderPdf(model: WorkReportModel): Promise<Buffer> {
  const html = reportDocument(workHoursReport, model);
  const win = new BrowserWindow({show: false, webPreferences: {sandbox: true, offscreen: true}});
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const margin = workHoursReport.marginPt / 72; // inches
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: workHoursReport.footer?.(model) ?? '<span></span>',
      margins: {top: margin, bottom: margin, left: margin, right: margin},
    });
  } finally {
    win.destroy();
  }
}

export function registerReportIpc(dataDir: string): void {
  ipcMain.handle('report-defaults', () => reportDefaults(openCurrent(dataDir)));

  ipcMain.handle('report-pdf', async (_e, params: ReportParams): Promise<ReportResult> => {
    const db = openCurrent(dataDir);
    if (!db) {
      return {ok: false, error: 'No data synced yet.'};
    }
    let model: WorkReportModel;
    try {
      model = buildModel(db, params);
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      return {ok: false, error: ERRORS[code] ?? 'Could not build the report.'};
    }
    const {filePath, canceled} = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), `kelomit-report-${params.from}-${params.to}.pdf`),
      filters: [{name: 'PDF', extensions: ['pdf']}],
    });
    if (canceled || !filePath) {
      return {ok: false, cancelled: true};
    }
    try {
      writeFileSync(filePath, await renderPdf(model));
    } catch (e) {
      return {ok: false, error: e instanceof Error ? e.message : String(e)};
    }
    shell.openPath(filePath).catch(() => {});
    return {ok: true, path: filePath};
  });
}
