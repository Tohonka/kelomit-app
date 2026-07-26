import {Hono} from 'hono';
import {openCurrent} from '../db.ts';
import {getDaysInRange, getEntriesInRange, getSetting} from '../queries.ts';
import {esc, reportLayout} from '../render.ts';
import {buildWorkReport} from '../../../src/services/workReport.ts';
import type {
  ReportLanguage,
  WorkReportModel,
  WorkReportType,
} from '../../../src/services/workReport.ts';

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

function reportHtml(model: WorkReportModel): string {
  const rows = model.days
    .map(
      d =>
        `<tr>
          <td>${esc(d.date)}</td>
          <td>${esc(d.weekday)}</td>
          <td class="num right">${esc(d.hours)}</td>
        </tr>` +
        (d.details || d.headlines.length
          ? `<tr class="detail"><td colspan="3">
              ${d.details ? `<span class="muted">${esc(d.details)}</span>` : ''}
              ${d.headlines.length ? `<ul>${d.headlines.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
            </td></tr>`
          : ''),
    )
    .join('');

  const stats = model.statistics
    ? `<section class="stats">
        <h2>${esc(model.statistics.title)}</h2>
        <h3>${esc(model.statistics.byProjectTitle)}</h3>
        <table>${model.statistics.projectRows
          .map(r => `<tr><td>${esc(r.label)}</td><td class="num right">${esc(r.hours)}</td></tr>`)
          .join('')}</table>
        <h3>${esc(model.statistics.byTagTitle)}</h3>
        <table>${model.statistics.tagRows
          .map(r => `<tr><td>${esc(r.label)}</td><td class="num right">${esc(r.hours)}</td></tr>`)
          .join('')}</table>
        <p class="muted">${esc(model.statistics.nonExclusiveNote)}</p>
      </section>`
    : '';

  return `<article class="sheet">
    <header class="sheet-head">
      <div>
        <h1>${esc(model.meta.title)}</h1>
        <p class="muted">${esc(model.meta.range)}</p>
      </div>
      <div class="right">
        <p class="who">${esc(model.meta.personName)}</p>
        <p class="muted">${esc(model.meta.companyName)}</p>
      </div>
    </header>
    <table class="sheet-table">
      <thead>
        <tr>
          <th>${esc(model.columns.date)}</th>
          <th>${esc(model.columns.weekday)}</th>
          <th class="right">${esc(model.columns.hours)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2">${esc(model.meta.totalLabel)}</td>
          <td class="num right">${esc(model.meta.totalHours)}</td>
        </tr>
      </tfoot>
    </table>
    ${stats}
  </article>`;
}

export function reportRoutes(opts: {dataDir: string}): Hono {
  const app = new Hono();

  app.get('/report', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(reportLayout('Report', '<h1>Report</h1><p class="empty">No data synced yet.</p>'));
    }

    const fallback = defaultRange();
    const from = c.req.query('from') || fallback.from;
    const to = c.req.query('to') || fallback.to;
    // Person and company default to whatever the phone has set — the settings
    // table rides along in the synced database.
    const person = c.req.query('person') ?? getSetting(db, 'report_person_name') ?? '';
    const company = c.req.query('company') ?? getSetting(db, 'report_company_name') ?? '';
    const type = pick(c.req.query('type'), TYPES, 'hours');
    const language = pick(c.req.query('language'), LANGUAGES, 'fi');

    const controls =
      `<p><a class="link" href="/">&larr; Days</a></p>` +
      form({from, to, person, company, language, type});

    let body: string;
    try {
      // The app's own report model — same totals, same labels, same rules.
      const model = buildWorkReport({
        personName: person,
        companyName: company,
        startDate: from,
        endDate: to,
        language,
        type,
        days: getDaysInRange(db, from, to),
        entries: getEntriesInRange(db, from, to),
      });
      body = reportHtml(model) + '<p class="print-hint">Print this page (Ctrl/Cmd&nbsp;+&nbsp;P) and choose “Save as PDF”.</p>';
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      body = `<p class="empty">${esc(ERRORS[code] ?? 'Could not build the report.')}</p>`;
    }

    return c.html(reportLayout('Report', controls + body));
  });

  return app;
}
