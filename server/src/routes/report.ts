import {Hono} from 'hono';
import type {Context} from 'hono';
import type Database from 'better-sqlite3';
import {openCurrent} from '../db.ts';
import {
  getDaysInRange,
  getEntriesInRange,
  getLeaveRangesInRange,
  getSetting,
} from '../queries.ts';
import {esc} from '../render.ts';
import {reportLayout} from '../reportSheet.ts';
import {CHROMIUM_MISSING, htmlToPdf} from '../pdf.ts';
// The shared report template — one document, rendered here by Chromium and on
// the phone by an offscreen WebView. Import concrete files, never a barrel:
// src/ is CJS and cjs-module-lexer cannot see through `export *`.
import {reportDocument} from '../../../src/reports/document.ts';
import {workHoursReport} from '../../../src/reports/workHours/index.ts';
import {buildWorkReport} from '../../../src/reports/workHours/build.ts';
import type {
  ReportLanguage,
  WorkReportModel,
  WorkReportType,
} from '../../../src/reports/workHours/build.ts';

const TYPES: WorkReportType[] = ['hours', 'headlines', 'statistics'];
const LANGUAGES: ReportLanguage[] = ['fi', 'en'];

/** `buildWorkReport` signals refusals by throwing these codes. They are the
 *  app's own i18n keys, so give them plain English here. */
const ERRORS: Record<string, string> = {
  report_person_required: 'Enter a name.',
  report_company_required: 'Enter a company.',
  report_invalid_range: 'The start date is after the end date.',
  report_empty: 'No worked hours in that range.',
};

function pick<T extends string>(value: string | undefined, allowed: T[], fallback: T): T {
  return allowed.includes((value ?? '') as T) ? (value as T) : fallback;
}

/** Default range: the calendar month containing today. */
function defaultRange(): {from: string; to: string} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0)))};
}

function form(values: {
  from: string;
  to: string;
  person: string;
  company: string;
  language: ReportLanguage;
  type: WorkReportType;
}): string {
  const opt = (v: string, label: string, selected: string) =>
    `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`;
  return `<form class="range report-form" method="get">
    <input type="date" name="from" value="${esc(values.from)}" aria-label="From">
    <input type="date" name="to" value="${esc(values.to)}" aria-label="To">
    <input type="text" name="person" value="${esc(values.person)}" placeholder="Name" aria-label="Name">
    <input type="text" name="company" value="${esc(values.company)}" placeholder="Company" aria-label="Company">
    <select name="type" aria-label="Report type">
      ${opt('hours', 'Hours', values.type)}
      ${opt('headlines', 'Hours + headlines', values.type)}
      ${opt('statistics', 'Hours + statistics', values.type)}
    </select>
    <select name="language" aria-label="Language">
      ${opt('fi', 'Suomi', values.language)}
      ${opt('en', 'English', values.language)}
    </select>
    <button type="submit">Show</button>
  </form>`;
}

/** Every knob the two report routes share, resolved from the query string. */
interface ReportParams {
  from: string;
  to: string;
  person: string;
  company: string;
  type: WorkReportType;
  language: ReportLanguage;
}

/** Reads the request and the synced settings. Must run while the database
 *  handle is still valid, i.e. before any `await`. */
function readParams(c: Context, db: Database.Database): ReportParams {
  const fallback = defaultRange();
  return {
    from: c.req.query('from') || fallback.from,
    to: c.req.query('to') || fallback.to,
    // Person and company default to whatever the phone has set — the settings
    // table rides along in the synced database.
    person: c.req.query('person') ?? getSetting(db, 'report_person_name') ?? '',
    company: c.req.query('company') ?? getSetting(db, 'report_company_name') ?? '',
    type: pick(c.req.query('type'), TYPES, 'hours'),
    language: pick(c.req.query('language'), LANGUAGES, 'fi'),
  };
}

function buildModel(db: Database.Database, p: ReportParams): WorkReportModel {
  // The app's own report model — same totals, same labels, same rules.
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

function errorMessage(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return ERRORS[code] ?? 'Could not build the report.';
}

export function reportRoutes(opts: {dataDir: string}): Hono {
  const app = new Hono();

  app.get('/report', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(reportLayout('Report', '<h1>Report</h1><p class="empty">No data synced yet.</p>'));
    }

    const params = readParams(c, db);
    const controls =
      `<p><a class="link" href="/">&larr; Days</a></p>` + form(params);

    let body: string;
    try {
      body =
        `<p><a class="pdf-btn" href="/report.pdf?${esc(downloadQuery(params))}">Download PDF</a></p>` +
        workHoursReport.html(buildModel(db, params));
    } catch (e) {
      body = `<p class="empty">${esc(errorMessage(e))}</p>`;
    }

    return c.html(reportLayout('Report', controls + body));
  });

  app.get('/report.pdf', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.text('No data synced yet.', 404);
    }

    // Everything that touches the database happens here, before the first
    // await — the handle must not be held across one (see db.ts).
    const params = readParams(c, db);
    let model: WorkReportModel;
    try {
      model = buildModel(db, params);
    } catch (e) {
      return c.text(errorMessage(e), 400);
    }

    let pdf: Uint8Array<ArrayBuffer>;
    try {
      pdf = await htmlToPdf(reportDocument(workHoursReport, model), {
        footerTemplate: workHoursReport.footer?.(model) ?? '<span></span>',
        marginPt: workHoursReport.marginPt,
      });
    } catch (e) {
      const missing = e instanceof Error && e.message === CHROMIUM_MISSING;
      console.error('report.pdf failed:', e);
      return c.text(
        missing ? 'PDF rendering is unavailable on this server.' : 'Could not render the PDF.',
        missing ? 501 : 500,
      );
    }

    return new Response(pdf, {
      headers: {
        'content-type': 'application/pdf',
        // Same filename the phone's export uses.
        'content-disposition':
          `attachment; filename="work-report-${params.from}-to-${params.to}.pdf"`,
      },
    });
  });

  return app;
}

/** The current form state, as a query string for the PDF link. */
function downloadQuery(p: ReportParams): string {
  return new URLSearchParams({
    from: p.from,
    to: p.to,
    person: p.person,
    company: p.company,
    type: p.type,
    language: p.language,
  }).toString();
}
