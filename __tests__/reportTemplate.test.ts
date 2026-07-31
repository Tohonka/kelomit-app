import {REPORTS, getReport, reportDocument} from '../src/reports';
import {workHoursReport} from '../src/reports/workHours';
import type {Day, Entry, LeaveRange} from '../src/types';

const day = (o: Partial<Day>): Day => ({
  id: 1,
  date: '2026-07-25',
  started_at: null,
  ended_at: null,
  started_at_2: null,
  ended_at_2: null,
  started_at_source: null,
  ended_at_source: null,
  notes: null,
  created_at: '2026-07-25T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
  ...o,
});

const entry = (o: Partial<Entry>): Entry => ({
  id: 1,
  day_id: 1,
  entry_type: 'note',
  activity_type: 'work',
  project_id: null,
  title: null,
  body: null,
  file_path: null,
  thumbnail_path: null,
  duration_sec: null,
  time_from: null,
  time_to: null,
  latitude: null,
  longitude: null,
  location_label: null,
  is_todo: false,
  is_overtime: false,
  scheduled_date: null,
  completed_at: null,
  reminder_at: null,
  created_at: '2026-07-25T08:00:00.000Z',
  updated_at: '2026-07-25T08:00:00.000Z',
  tags: [],
  project: null,
  ...o,
});

const project = {
  id: 1,
  name: 'Client <A> & "B"',
  type: 'work' as const,
  archived: false,
  created_at: '',
  updated_at: '',
};

const days: Day[] = [
  day({
    id: 1,
    date: '2026-07-25',
    started_at: '2026-07-25T06:00:00.000Z',
    ended_at: '2026-07-25T14:00:00.000Z',
  }),
];

const entries: Entry[] = [
  entry({
    id: 1,
    day_id: 1,
    title: 'Kickoff & <review>',
    time_from: '2026-07-25T07:00:00.000Z',
    time_to: '2026-07-25T09:00:00.000Z',
    project,
    tags: [{id: 1, name: "O'Brien", created_at: ''}],
  }),
  entry({
    id: 2,
    day_id: 1,
    title: 'Overtime push',
    is_overtime: true,
    time_from: '2026-07-25T14:00:00.000Z',
    time_to: '2026-07-25T16:00:00.000Z',
  }),
];

const leaveRanges: LeaveRange[] = [
  {
    id: 1,
    type: 'vacation',
    start_date: '2026-07-26',
    end_date: '2026-07-26',
    created_at: '',
    updated_at: '',
  },
];

const input = {
  personName: 'Ada <Example>',
  companyName: 'Example & Co Oy',
  startDate: '2026-07-25',
  endDate: '2026-07-26',
  language: 'fi' as const,
  type: 'statistics' as const,
  days,
  entries,
  leaveRanges,
};

describe('report registry', () => {
  it('resolves a template by id and refuses unknown ids', () => {
    expect(getReport('work-hours')).toBe(workHoursReport);
    expect(() => getReport('nope')).toThrow('report_unknown_template');
  });

  it('gives every template a unique id', () => {
    const ids = REPORTS.map(report => report.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('work-hours template', () => {
  // The regression guard for the template extraction. This document was proven
  // byte-identical to the server's previous hand-written renderer across both
  // languages and all three variants; keep it that way until a restyle is
  // deliberate.
  it('renders a stable document', () => {
    const model = workHoursReport.build(input);
    expect(reportDocument(workHoursReport, model)).toMatchSnapshot();
  });

  it('carries the page margin only when the renderer needs it', () => {
    const model = workHoursReport.build(input);

    // Chromium/Puppeteer applies its own margin and prints the footer into it.
    expect(reportDocument(workHoursReport, model)).toContain('@page { size: A4; }');
    // Android's WebView applies none, so the document has to.
    expect(reportDocument(workHoursReport, model, {pageMargin: true}))
      .toContain(`@page { size: A4; margin: ${workHoursReport.marginPt}pt; }`);
  });

  it('escapes free text from the phone in every slot it lands in', () => {
    const html = workHoursReport.html(workHoursReport.build(input));

    expect(html).toContain('Ada &lt;Example&gt;');
    expect(html).toContain('Example &amp; Co Oy');
    expect(html).toContain('Kickoff &amp; &lt;review&gt;');
    expect(html).toContain('Client &lt;A&gt; &amp; &quot;B&quot;');
    expect(html).toContain('O&#39;Brien');
    expect(html).not.toContain('<review>');
  });

  it('produces a self-contained document — nothing to fetch at print time', () => {
    const html = reportDocument(workHoursReport, workHoursReport.build(input));

    // The phone loads this with a null base URL in an offscreen WebView, so any
    // external reference would silently render as missing.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/@import/i);
  });
});
