import {esc} from './escape.ts';
import type {ReportTemplate} from './types.ts';

/**
 * Wrap a template's body and CSS into the self-contained document both
 * renderers print.
 *
 * SELF-CONTAINED IS LOAD-BEARING: the phone loads this with a null base URL in
 * an offscreen WebView, so there is nowhere to fetch from. No external
 * stylesheet, font file or image will resolve — inline everything.
 */
export function reportDocument<TModel extends {meta: {title: string}}>(
  template: ReportTemplate<TModel>,
  model: TModel,
  options: {pageMargin?: boolean} = {},
): string {
  // Who owns the page margin differs by renderer, so the caller says.
  //
  // Chromium (server) is driven through Puppeteer, which applies the margin
  // itself and needs that margin box free to print the page footer into.
  //
  // Android's WebView gets no margin from anyone: PrintAttributes.setMinMargins
  // is only a hint and the "Save as PDF" target reports a full-bleed printable
  // area, so without this the report runs edge to edge. WebView is Chromium, so
  // @page margin works and applies to *every* page — body padding would not, it
  // insets only the start and end of the flow.
  const page = options.pageMargin
    ? `@page { size: A4; margin: ${template.marginPt}pt; }`
    : '@page { size: A4; }';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(model.meta.title)}</title>
<style>
${page}
html, body { margin: 0; padding: 0; background: #FFFFFF; }
/* The app ellipsizes overlong labels to keep its hand-drawn columns aligned.
   Here the browser wraps them instead — same content, no truncation. */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
h1, h2, h3 { break-after: avoid; }
${template.css}
</style>
</head>
<body>${template.html(model)}</body>
</html>`;
}
