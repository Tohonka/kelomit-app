import {esc} from '../escape.ts';
import {NAVY_TEXT, PAGE_MARGIN_PT} from './css.ts';
import type {WorkReportModel} from './build.ts';

type AllocationRow = {label: string; hours: string; seconds: number};

/** Label + hours + a bar scaled against the biggest row. */
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
      // One <tbody> per day so a day's headlines cannot be orphaned onto the
      // next page from their date row — see .sheet-table tbody in css.ts.
      return (
        `<tbody><tr${headlines ? '' : ' class="close"'}>
          <td>${esc(d.date)}</td>
          <td>${esc(d.workTime)}</td>
          <td class="right num">${esc(d.regular)}</td>
          <td class="right num">${esc(d.remoteOther)}</td>
          <td class="right num">${esc(d.overtime)}</td>
          <td class="right total num">${esc(d.total)}</td>
        </tr>` +
        (headlines
          ? `<tr class="close"><td class="headlines" colspan="6">${headlines}</td></tr>`
          : '') +
        '</tbody>'
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
      ${rows}
    </table>
    ${stats}
  </article>`;
}

/**
 * Chromium footer: identity on the left, the model's own page label right.
 *
 * Server-only. Android's WebView print adapter exposes no header/footer hook
 * and WebView supports neither CSS margin boxes nor running elements, so the
 * on-device PDF has no footer at all.
 */
export function footerTemplate(model: WorkReportModel): string {
  const identity = `${model.meta.companyName} · ${model.meta.personName}`;
  return `<div style="width:100%;margin:0 ${PAGE_MARGIN_PT}pt;font-family:'Noto Sans',sans-serif;font-size:9pt;color:${NAVY_TEXT};display:flex;justify-content:space-between;">
    <span>${esc(identity)}</span>
    <span>${esc(model.meta.pageLabel)} <span class="pageNumber"></span></span>
  </div>`;
}
