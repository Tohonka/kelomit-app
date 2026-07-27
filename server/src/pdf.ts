import {existsSync} from 'node:fs';
import puppeteer from 'puppeteer-core';

/** Thrown when no Chromium is installed — the one failure worth its own reply. */
export const CHROMIUM_MISSING = 'chromium_missing';

// puppeteer-core never downloads a browser, so the binary comes from the image
// (Alpine's `chromium` package) or, in local dev, from whatever Chrome the
// developer already has.
const CANDIDATES = [
  process.env.KELOMIT_CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export function chromiumPath(): string | null {
  return CANDIDATES.find((p): p is string => !!p && existsSync(p)) ?? null;
}

/**
 * Print a self-contained HTML document to A4 PDF bytes.
 *
 * A browser is launched per request and closed again: reports are rare and
 * single-user here, so a pooled instance would only add lifecycle bugs and a
 * few hundred MB of idle RSS.
 */
export async function htmlToPdf(
  html: string,
  options: {footerTemplate: string; marginPt: number},
  // `Uint8Array<ArrayBuffer>`, not puppeteer's `ArrayBufferLike` flavour, so the
  // bytes can go straight into a Response body.
): Promise<Uint8Array<ArrayBuffer>> {
  const executablePath = chromiumPath();
  if (!executablePath) {
    throw new Error(CHROMIUM_MISSING);
  }
  const browser = await puppeteer.launch({
    executablePath,
    // The container runs as root and the page is our own markup, never remote
    // content, so Chromium's sandbox has nothing to protect here.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: 'load'});
    // Puppeteer's margin parser knows px/in/cm/mm but not pt — 72pt to the inch.
    const margin = `${options.marginPt / 72}in`;
    const bytes = await page.pdf({
      format: 'a4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: options.footerTemplate,
      margin: {top: margin, bottom: margin, left: margin, right: margin},
    });
    return new Uint8Array(bytes);
  } finally {
    await browser.close();
  }
}
