// The work-hours sheet's stylesheet.
//
// This was reverse-engineered from the app's old Kotlin Canvas renderer, so the
// geometry is still expressed in the points that renderer used — A4 is
// 595x842pt, so its constants were already CSS points and carried over 1:1.
// Now that CSS is the only source of truth, none of these numbers are load-
// bearing any more; they are simply the current design and can be changed
// freely. Kept verbatim through the template extraction so the refactor could be
// proven byte-identical.
const NAVY = '#193047';
const BLUE = '#2B6CB0';
const PALE_BLUE = '#E8F2FB';
const DIVIDER = '#D6E0EA';

/** The page box: A4 with a 42pt margin. */
export const PAGE_MARGIN_PT = 42;

// Date, work time, regular, remote/other, overtime, total.
const COLUMN_WIDTHS_PT = [88, 104, 58, 88, 58, 68];
const TABLE_WIDTH_PT = COLUMN_WIDTHS_PT.reduce((a, b) => a + b, 0);

export const NAVY_TEXT = NAVY;

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
/* Column widths, the table's right edge and the 5pt cell gap are
   WorkReportLayout's own constants — the table stops well short of the right
   margin on paper, exactly as the app draws it. */
.sheet-table {
  table-layout: fixed;
  width: ${TABLE_WIDTH_PT}pt;
  border-collapse: collapse;
  margin-top: 18pt;
  line-height: 11pt;
}
${COLUMN_WIDTHS_PT.map(
  (w, i) => `.sheet-table col:nth-child(${i + 1}) { width: ${w}pt; }`,
).join('\n')}
.sheet-table th {
  background: ${PALE_BLUE};
  font-size: 8pt;
  font-weight: 700;
  text-align: left;
  height: 32pt;
  padding: 5.5pt 5pt 0 0;
  vertical-align: top;
}
.sheet-table th.right, .sheet-table td.right { text-align: right; }
/* 28pt is the app's minimum row height; a wrapped date or work-time grows it. */
.sheet-table td { font-size: 9pt; height: 28pt; padding: 6pt 5pt 0 0; vertical-align: top; }
/* Durations sit lower in the row than the date, as on paper. */
.sheet-table td.right { font-size: 8.5pt; padding-top: 10.5pt; }
.sheet-table td.total { font-weight: 700; }
/* One day = its row plus the headline row underneath. The hairline closes the
   pair, so it belongs to the LAST row of the group. */
.sheet-table tr.close td { padding-bottom: 4pt; border-bottom: 0.75pt solid ${DIVIDER}; }
/* Each day is its own tbody, so this keeps a date row and its headlines on the
   same page. A day taller than a page still breaks — the engine ignores
   break-inside when it has no choice. */
.sheet-table tbody { break-inside: avoid; }
.sheet-table td.headlines { height: auto; padding: 0 0 5pt; }
.sheet-headlines { list-style: none; margin: 0; padding: 0; }
.sheet-headlines li {
  font-size: 9.5pt;
  line-height: 14pt;
  padding-left: 22pt;
  position: relative;
}
.sheet-headlines li::before {
  content: '';
  position: absolute;
  left: 8pt;
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
