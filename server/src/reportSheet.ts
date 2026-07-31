import {layout} from './render.ts';
import {PAGE_MARGIN_PT, SHEET_CSS} from '../../src/reports/workHours/css.ts';

// The report *document* — markup, stylesheet and page footer — now lives in
// src/reports/workHours/, shared verbatim with the phone. What is left here is
// only the server's own chrome: the controls around the sheet and the rules for
// laying a white A4 page on the dark app background.
//
// Import concrete files from src/reports, never a barrel: src/ is CommonJS and
// Node analyses it with cjs-module-lexer, which cannot see through `export *`.

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
