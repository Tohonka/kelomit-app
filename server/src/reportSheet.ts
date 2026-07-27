import {esc, layout} from './render.ts';
import type {WorkReportModel} from '../../src/services/workReport.ts';

// A paper copy of the report the phone produces. The app draws its PDF with
// Android's Canvas (android/.../reporting/WorkReportRenderer.kt); this is the
// same document expressed as HTML so Chromium can print it. Every colour, font
// size and offset below is lifted from that renderer — A4 is 595x842pt, so the
// Kotlin constants are already CSS points and carry over 1:1.
const NAVY = '#193047';
const BLUE = '#2B6CB0';
const PALE_BLUE = '#E8F2FB';
const DIVIDER = '#D6E0EA';

/** The page box, matching WorkReportLayout: A4 with a 42pt margin. */
export const PAGE_MARGIN_PT = 42;

export const SHEET_CSS = `
.sheet {
  color: ${NAVY};
  /* Android draws with Roboto; Noto Sans is the closest thing an Alpine image
     has. Metrics differ slightly, so the sheet wraps text rather than
     ellipsizing it — see the note in reportDocument(). */
  font-family: 'Noto Sans', 'Liberation Sans', 'DejaVu Sans', system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.35;
}
.sheet h1 { font-size: 20pt; line-height: 25pt; margin: 0; font-weight: 700; }
.sheet-rule { height: 3pt; background: ${BLUE}; margin-top: 8pt; }
.sheet-ident { margin-top: 25pt; }
.sheet-ident p { margin: 0; }
.sheet-company { font-size: 13pt; line-height: 18pt; font-weight: 700; }
.sheet-person { font-size: 11pt; line-height: 17pt; }
.sheet-range { font-size: 10pt; line-height: 15pt; }
.sheet-total {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  background: ${PALE_BLUE};
  min-height: 58pt;
  margin-top: 16pt;
  padding: 13pt 14pt 0;
}
.sheet-total-label { font-size: 10pt; }
.sheet-total-hours {
  font-size: 25pt;
  line-height: 25pt;
  font-weight: 700;
  color: ${BLUE};
  align-self: flex-end;
  padding-bottom: 8pt;
  white-space: nowrap;
}
.sheet-table { width: 100%; border-collapse: collapse; margin-top: 18pt; }
.sheet-table col:nth-child(1) { width: 19%; }
.sheet-table col:nth-child(2) { width: 22%; }
.sheet-table col:nth-child(3) { width: 12%; }
.sheet-table col:nth-child(4) { width: 19%; }
.sheet-table col:nth-child(5) { width: 12%; }
.sheet-table col:nth-child(6) { width: 16%; }
.sheet-table th {
  background: ${PALE_BLUE};
  font-size: 9pt;
  font-weight: 700;
  text-align: left;
  padding: 8pt 10pt;
}
.sheet-table th.right, .sheet-table td.right { text-align: right; }
.sheet-table td { padding: 7pt 10pt 0; vertical-align: top; }
.sheet-table td.total { font-weight: 700; }
/* One day = its date row plus the detail/headline row underneath. The hairline
   closes the pair, so it belongs to the LAST row of the group. */
.sheet-table tr.close td { padding-bottom: 7pt; border-bottom: 0.75pt solid ${DIVIDER}; }
.sheet-detail { color: ${BLUE}; font-size: 9pt; margin: 0; }
.sheet-headlines { list-style: none; margin: 5pt 0 0; padding: 0; }
.sheet-headlines li {
  font-size: 9.5pt;
  line-height: 14pt;
  padding-left: 12pt;
  position: relative;
}
.sheet-headlines li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5pt;
  width: 4pt;
  height: 4pt;
  background: ${BLUE};
}
.sheet-stats { break-before: page; padding-top: 12pt; }
.sheet-stats h2 { font-size: 20pt; line-height: 24pt; margin: 0 0 14pt; font-weight: 700; }
.sheet-stats h3 { font-size: 13pt; line-height: 18pt; margin: 18pt 0 7pt; font-weight: 700; }
.sheet-stats h3:first-of-type { margin-top: 0; }
.sheet-note { font-size: 9pt; font-style: italic; margin: 0 0 7pt; }
.sheet-alloc { break-inside: avoid; margin-bottom: 6pt; }
.sheet-alloc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  font-size: 9.5pt;
  line-height: 14pt;
}
.sheet-alloc-head b { font-weight: 700; white-space: nowrap; }
.sheet-bar { height: 7pt; background: ${PALE_BLUE}; margin-top: 3pt; }
.sheet-bar span { display: block; height: 100%; background: ${BLUE}; }
.num { font-variant-numeric: tabular-nums lining-nums; }
`;

type AllocationRow = {label: string; hours: string; seconds: number};

/** Label + hours + a bar scaled against the biggest row, as the app draws it. */
function allocRows(list: AllocationRow[]): string {
  const max = list.reduce((m, r) => Math.max(m, r.seconds), 0);
  return list
    .map(r => {
      const pct = max > 0 ? (r.seconds / max) * 100 : 0;
      return `<div class="sheet-alloc">
        <div class="sheet-alloc-head"><span>${esc(r.label)}</span><b class="num">${esc(r.hours)}</b></div>
        <div class="sheet-bar"><span style="width:${pct.toFixed(2)}%"></span></div>
      </div>`;
    })
    .join('');
}

/** The report body, identical on screen and on paper. */
export function sheetHtml(model: WorkReportModel): string {
  const rows = model.days
    .map(d => {
      const headlines = d.headlines.length
        ? `<ul class="sheet-headlines">${d.headlines.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
        : '';
      return (
        `<tr${headlines ? '' : ' class="close"'}>
          <td>${esc(d.date)}</td>
          <td>${esc(d.workTime)}</td>
          <td class="right num">${esc(d.regular)}</td>
          <td class="right num">${esc(d.remoteOther)}</td>
          <td class="right num">${esc(d.overtime)}</td>
          <td class="right total num">${esc(d.total)}</td>
        </tr>` +
        (headlines ? `<tr class="close"><td colspan="6">${headlines}</td></tr>` : '')
      );
    })
    .join('');

  const stats = model.statistics
    ? `<section class="sheet-stats">
        <h2>${esc(model.statistics.title)}</h2>
        <h3>${esc(model.statistics.byProjectTitle)}</h3>
        ${allocRows(model.statistics.projectRows)}
        <h3>${esc(model.statistics.byTagTitle)}</h3>
        <p class="sheet-note">${esc(model.statistics.nonExclusiveNote)}</p>
        ${allocRows(model.statistics.tagRows)}
      </section>`
    : '';

  return `<article class="sheet">
    <h1>${esc(model.meta.title)}</h1>
    <div class="sheet-rule"></div>
    <div class="sheet-ident">
      <p class="sheet-company">${esc(model.meta.companyName)}</p>
      <p class="sheet-person">${esc(model.meta.personName)}</p>
      <p class="sheet-range">${esc(model.meta.range)}</p>
    </div>
    <div class="sheet-total">
      <span class="sheet-total-label">${esc(model.meta.totalLabel)}</span>
      <span class="sheet-total-hours num">${esc(model.meta.totalHours)}</span>
    </div>
    <table class="sheet-table">
      <colgroup><col><col><col><col><col><col></colgroup>
      <thead>
        <tr>
          <th>${esc(model.columns.date)}</th>
          <th>${esc(model.columns.workTime)}</th>
          <th class="right">${esc(model.columns.regular)}</th>
          <th class="right">${esc(model.columns.remoteOther)}</th>
          <th class="right">${esc(model.columns.overtime)}</th>
          <th class="right">${esc(model.columns.total)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${stats}
  </article>`;
}

/** Standalone page for Chromium to print — no app chrome, no dark theme. */
export function reportDocument(model: WorkReportModel): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(model.meta.title)}</title>
<style>
@page { size: A4; }
html, body { margin: 0; padding: 0; background: #FFFFFF; }
/* The app ellipsizes overlong labels to keep its hand-drawn columns aligned.
   Here the browser wraps them instead — same content, no truncation. */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
h1, h2, h3 { break-after: avoid; }
${SHEET_CSS}
</style>
</head>
<body>${sheetHtml(model)}</body>
</html>`;
}

/** Chromium footer: identity on the left, the model's own page label right. */
export function footerTemplate(model: WorkReportModel): string {
  const identity = `${model.meta.companyName} · ${model.meta.personName}`;
  return `<div style="width:100%;margin:0 ${PAGE_MARGIN_PT}pt;font-family:'Noto Sans',sans-serif;font-size:9pt;color:${NAVY};display:flex;justify-content:space-between;">
    <span>${esc(identity)}</span>
    <span>${esc(model.meta.pageLabel)} <span class="pageNumber"></span></span>
  </div>`;
}

// The report page. The controls are app-styled; the sheet itself is the same
// document Chromium prints for /report.pdf, so the screen is a true preview.
const REPORT_CSS = `
.report-form { align-items: center; }
.report-form select {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
}
.pdf-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 0.6rem;
  background: var(--work);
  color: var(--bg);
  font-weight: 600;
  text-decoration: none;
}
/* A white A4 page laid on the dark app chrome. */
.sheet {
  background: #FFFFFF;
  border-radius: 0.4rem;
  padding: ${PAGE_MARGIN_PT}pt;
  margin-top: 1rem;
  overflow-x: auto;
}
${SHEET_CSS}

@media print {
  /* Browser printing still works and still matches, but the button is the
     path that actually gets used. */
  @page { size: A4; margin: ${PAGE_MARGIN_PT}pt; }
  body { max-width: none; padding: 0; background: #FFFFFF; }
  .report-form, .pdf-btn, .link { display: none !important; }
  .sheet { padding: 0; margin: 0; border-radius: 0; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  h1, h2, h3 { break-after: avoid; }
}
`;
/** Report pages carry the sheet styles on top of the app chrome. */
export function reportLayout(title: string, body: string): string {
  return layout(title, body).replace('</style>', `${REPORT_CSS}</style>`);
}
