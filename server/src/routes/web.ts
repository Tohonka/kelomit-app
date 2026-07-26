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
import type {MediaRow, RouteSegmentRow, RouteStopRow} from '../queries.ts';
import {esc, layout, mediaUrl} from '../render.ts';
import {
  calcDayWorkSecs,
  calcHourBreakdown,
  formatHours,
} from '../../../src/utils/hoursUtils.ts';
import type {Day, Entry} from '../../../src/types/index.ts';

const NO_DATA = layout('Kelomit', '<h1>Kelomit</h1><p class="empty">No data synced yet.</p>');

const ACTIVITY_LABEL: Record<string, string> = {
  work: 'Work',
  personal_work: 'Personal at work',
  personal: 'Personal',
};

/** `2026-07-25` → `Sat 25 July`. Dates are plain text, so parse the parts
 *  directly rather than going through Date and inheriting a timezone shift. */
function formatDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `2026-07-25T08:30:00.000Z` → `08:30`, in whatever the stored string says.
 *  The app writes local wall-clock times, so slicing beats re-parsing. */
function clock(ts: string | null): string {
  if (!ts) {
    return '';
  }
  const match = ts.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : ts;
}

function section(label: string, body: string): string {
  return `<p class="section-label">${esc(label)}</p>${body}`;
}

function splitBar(entries: Entry[]): string {
  const b = calcHourBreakdown(entries);
  if (b.totalTrackedSeconds <= 0) {
    return section(
      'Split',
      '<div class="card"><p class="empty">No time tracked.</p></div>',
    );
  }
  const pct = (n: number) => (n / b.totalTrackedSeconds) * 100;
  const parts: [string, string, number][] = [
    ['work', 'Work', b.workSeconds],
    ['personal-work', 'Personal at work', b.personalWorkSeconds],
    ['personal', 'Personal', b.personalSeconds],
  ];
  const bar = parts
    .filter(([, , secs]) => secs > 0)
    .map(([key, , secs]) => `<span style="width:${pct(secs).toFixed(2)}%;background:var(--${key})"></span>`)
    .join('');
  const legend = parts
    .filter(([, , secs]) => secs > 0)
    .map(
      ([key, label, secs]) =>
        `<span class="legend-item"><span class="dot" style="background:var(--${key})"></span>` +
        `${esc(label)} <span class="num">${esc(formatHours(secs))}</span></span>`,
    )
    .join('');
  return section('Split', `<div class="card"><div class="bar">${bar}</div><div class="legend">${legend}</div></div>`);
}

function dayCard(day: Day, entries: Entry[]): string {
  const from = clock(day.started_at);
  const to = clock(day.ended_at);
  const span = from || to ? `${esc(from || '?')}&ndash;${esc(to || '?')}` : 'Not set';
  return section(
    'Day',
    `<div class="card">
      <div class="entry-head">
        <span>Start &amp; end</span>
        <span class="entry-time">${span}</span>
      </div>
      <p class="meta" style="margin:0.35rem 0 0">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</p>
    </div>`,
  );
}

function mediaHtml(own: MediaRow[]): string {
  const photos = own.filter(m => m.media_type === 'photo');
  const rest = own.filter(m => m.media_type !== 'photo');
  const shots = photos.length
    ? `<div class="shots">${photos
        .map(m => `<img src="${mediaUrl(m.file_path)}" alt="" loading="lazy">`)
        .join('')}</div>`
    : '';
  const others = rest
    .map(m => {
      if (m.media_type === 'voice') {
        return (
          `<audio controls preload="none" src="${mediaUrl(m.file_path)}"></audio>` +
          (m.transcript ? `<p class="transcript">${esc(m.transcript)}</p>` : '')
        );
      }
      // Video is deliberately never uploaded, so an <img> here would 404 into a
      // broken image. Say where the file actually is instead.
      return '<p class="meta" style="margin:0.5rem 0 0">Video &mdash; on the phone only</p>';
    })
    .join('');
  return shots + others;
}

function entryCard(e: Entry, own: MediaRow[]): string {
  const time =
    e.time_from || e.time_to
      ? `${esc(clock(e.time_from))}&ndash;${esc(clock(e.time_to))}`
      : e.duration_sec
        ? esc(formatHours(e.duration_sec))
        : '';

  const chips = [
    `<span class="chip badge ${esc(e.activity_type)}">${esc(ACTIVITY_LABEL[e.activity_type] ?? e.activity_type)}</span>`,
    ...(e.project ? [`<span class="chip">${esc(e.project.name)}</span>`] : []),
    ...(e.tags ?? []).map(t => `<span class="chip">#${esc(t.name)}</span>`),
  ].join('');

  return `<div class="card entry ${esc(e.activity_type)}">
    <div class="entry-head">
      <span class="entry-title">${esc(e.title ?? e.entry_type)}</span>
      <span class="entry-time">${time}</span>
    </div>
    ${e.body ? `<p class="entry-body">${esc(e.body)}</p>` : ''}
    <div class="chips">${chips}</div>
    ${mediaHtml(own)}
  </div>`;
}

function routeSection(segments: RouteSegmentRow[], stops: RouteStopRow[]): string {
  if (!segments.length && !stops.length) {
    return '';
  }
  const km = segments.reduce((sum, s) => sum + s.distance_m, 0) / 1000;
  const trips = segments
    .map(
      s =>
        `<div class="card trip">
          <span>${esc(clock(s.start_ts))}&ndash;${esc(clock(s.end_ts))}</span>
          <span class="meta num">${(s.distance_m / 1000).toFixed(1)}&nbsp;km &middot; ${esc(formatHours(s.duration_sec))}</span>
        </div>`,
    )
    .join('');
  const stopList = stops
    .map(
      s =>
        `<div class="card stop">
          <span>${esc(s.display_name ?? 'Unnamed stop')}</span>
          <span class="meta num" style="margin-left:auto">${esc(clock(s.start_ts))}</span>
        </div>`,
    )
    .join('');
  return (
    // A literal `·`, not `&middot;` — section() escapes its label, so an entity
    // here would render as visible `&middot;`.
    section(
      `Route · ${segments.length} ${segments.length === 1 ? 'trip' : 'trips'}, ${km.toFixed(1)} km`,
      trips,
    ) + (stopList ? section('Stops', stopList) : '')
  );
}

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
    const days = listDays(db, 120);

    let currentMonth = '';
    const rows = days
      .map(d => {
        const month = formatMonth(d.date);
        const heading = month === currentMonth ? '' : `<p class="month">${esc(month)}</p>`;
        currentMonth = month;
        const day = getDay(db, d.date);
        const hours = day ? formatHours(calcDayWorkSecs(day, getEntries(db, day.id))) : '';
        return (
          heading +
          `<a class="day-row" href="/day/${esc(d.date)}">
            <span class="day-date">${esc(formatDayLabel(d.date))}</span>
            <span class="day-grow meta">${d.entryCount} ${d.entryCount === 1 ? 'entry' : 'entries'}</span>
            <span class="day-hours">${esc(hours)}</span>
          </a>`
        );
      })
      .join('');

    return c.html(
      layout(
        'Days',
        `<h1>Days</h1><p><a class="link" href="/summary">Summary &rarr;</a> &nbsp; <a class="link" href="/report">Report &rarr;</a></p>` +
          (rows || '<p class="empty">No days recorded yet.</p>'),
      ),
    );
  });

  app.get('/day/:date', async c => {
    const db = openCurrent(opts.dataDir);
    if (!db) {
      return c.html(NO_DATA);
    }
    const day = getDay(db, c.req.param('date'));
    if (!day) {
      return c.html(layout('Not found', '<h1>Not found</h1><p><a class="link" href="/">&larr; Days</a></p>'), 404);
    }

    const entries = getEntries(db, day.id);
    const media = getEntryMedia(db, day.id);
    // The app's own hours model — never reimplement here.
    const hours = formatHours(calcDayWorkSecs(day, entries));
    const segments = getRouteSegments(db, day.id);
    const stops = getRouteStops(db, day.id);

    const entriesHtml = entries.length
      ? entries.map(e => entryCard(e, media.filter(m => m.entry_id === e.id))).join('')
      : '<div class="card"><p class="empty">No entries.</p></div>';

    return c.html(
      layout(
        day.date,
        `<p><a class="link" href="/">&larr; Days</a></p>
         <h1>${esc(formatDayLabel(day.date))}</h1>
         <p class="hours-big">${esc(hours)}</p>
         <p class="meta">worked</p>` +
          dayCard(day, entries) +
          splitBar(entries) +
          section('Entries', entriesHtml) +
          routeSection(segments, stops),
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
          `<a class="day-row" href="/day/${esc(d.date)}">
            <span class="day-date">${esc(formatDayLabel(d.date))}</span>
            <span class="day-grow"></span>
            <span class="day-hours">${esc(formatHours(secs))}</span>
          </a>`,
        ];
      })
      .join('');

    return c.html(
      layout(
        'Summary',
        `<p><a class="link" href="/">&larr; Days</a></p>
         <h1>Summary</h1>
         <form class="range" method="get">
           <input type="date" name="from" value="${esc(from)}" aria-label="From">
           <input type="date" name="to" value="${esc(to)}" aria-label="To">
           <button type="submit">Show</button>
         </form>
         <p class="hours-big">${esc(formatHours(total))}</p>
         <p class="meta">total across ${days.length} ${days.length === 1 ? 'day' : 'days'}</p>` +
          (rows ? section('Days', rows) : ''),
      ),
    );
  });

  return app;
}
