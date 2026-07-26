import {Hono} from 'hono';
import {serveStatic} from '@hono/node-server/serve-static';
import {join} from 'node:path';
import {openCurrent} from '../db.ts';
import {
  listDays,
  listDaysInRange,
  getDay,
  getEntries,
  getEntryMedia,
  getRouteSegments,
  getRouteStops,
} from '../queries.ts';
import {esc, layout, mediaUrl} from '../render.ts';
import {calcDayWorkSecs, formatHours} from '../../../src/utils/hoursUtils.ts';

const NO_DATA = layout('Kelomit', '<h1>Kelomit</h1><p>No data synced yet.</p>');

export function webRoutes(opts: {dataDir: string}): Hono {
  const app = new Hono();

  app.use(
    '/media/*',
    serveStatic({root: join(opts.dataDir, 'media'), rewriteRequestPath: p => p.replace(/^\/media/, '')}),
  );

  app.get('/', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(NO_DATA);
    }
    const days = listDays(db, 60);
    const rows = days
      .map(
        d =>
          `<a class="day" href="/day/${esc(d.date)}">` +
          `<span>${esc(d.date)}</span>` +
          `<span class="meta">${d.entryCount} entries</span></a>`,
      )
      .join('');
    return c.html(layout('Days', `<p><a href="/summary">Summary →</a></p><h1>Days</h1>${rows}`));
  });

  app.get('/day/:date', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(NO_DATA);
    }
    const day = getDay(db, c.req.param('date'));
    if (!day) {
      return c.html(layout('Not found', '<h1>Not found</h1>'), 404);
    }

    const entries = getEntries(db, day.id);
    const media = getEntryMedia(db, day.id);
    // The app's own hours model — never reimplement here.
    const hours = formatHours(calcDayWorkSecs(day, entries));

    const entryHtml = entries
      .map(e => {
        const own = media.filter(m => m.entry_id === e.id);
        const files = own
          .map(m =>
            m.media_type === 'voice'
              ? `<audio controls src="${mediaUrl(m.file_path)}"></audio>` +
                (m.transcript ? `<p class="meta">${esc(m.transcript)}</p>` : '')
              : `<img src="${mediaUrl(m.file_path)}" alt="">`,
          )
          .join('');
        return (
          `<div class="entry">` +
          `<strong>${esc(e.title ?? e.entry_type)}</strong>` +
          `<div class="meta">${esc(e.activity_type)} · ${esc(e.time_from ?? '')}–${esc(e.time_to ?? '')}</div>` +
          (e.body ? `<p>${esc(e.body)}</p>` : '') +
          files +
          `</div>`
        );
      })
      .join('');

    const stops = getRouteStops(db, day.id);
    const segments = getRouteSegments(db, day.id);
    const routeHtml = segments.length
      ? `<h2>Route</h2><p class="meta">${segments.length} trips, ${stops.length} stops</p>` +
        stops.map(s => `<div class="meta">${esc(s.display_name ?? '—')}</div>`).join('')
      : '';

    return c.html(
      layout(
        day.date,
        `<p><a href="/">← days</a></p><h1>${esc(day.date)}</h1>` +
          `<p class="meta">${esc(hours)} worked</p>${entryHtml}${routeHtml}`,
      ),
    );
  });

  app.get('/summary', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(NO_DATA);
    }
    const from = c.req.query('from') ?? '';
    const to = c.req.query('to') ?? '';
    const days = listDaysInRange(db, from, to);

    let total = 0;
    const rows = days
      .flatMap(d => {
        const day = getDay(db, d.date);
        if (!day) {
          return [];
        }
        const secs = calcDayWorkSecs(day, getEntries(db, day.id));
        total += secs;
        return [
          `<a class="day" href="/day/${esc(d.date)}">` +
            `<span>${esc(d.date)}</span>` +
            `<span class="meta">${esc(formatHours(secs))}</span></a>`,
        ];
      })
      .join('');

    return c.html(
      layout(
        'Summary',
        `<p><a href="/">← days</a></p><h1>Summary</h1>` +
          `<form method="get">` +
          `<input type="date" name="from" value="${esc(from)}">` +
          `<input type="date" name="to" value="${esc(to)}">` +
          `<button type="submit">Show</button></form>` +
          `<p><strong>${esc(formatHours(total))}</strong> total</p>${rows}`,
      ),
    );
  });

  return app;
}
