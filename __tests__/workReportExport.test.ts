jest.mock('../src/db/days', () => ({getDaysInRange: jest.fn()}));
jest.mock('../src/db/entries', () => ({getEntriesForDays: jest.fn()}));
jest.mock('../src/db/leaveRanges', () => ({
  ...jest.requireActual('../src/db/leaveRanges'),
  getLeaveRangesInRange: jest.fn(),
}));
jest.mock('../src/native/workReport', () => ({createNativeWorkReport: jest.fn()}));

import {getDaysInRange} from '../src/db/days';
import {getEntriesForDays} from '../src/db/entries';
import {getLeaveRangesInRange} from '../src/db/leaveRanges';
import {createNativeWorkReport} from '../src/native/workReport';
import {exportWorkReport} from '../src/services/workReportExport';
import type {Day} from '../src/types';

const getDaysInRangeMock = getDaysInRange as jest.MockedFunction<typeof getDaysInRange>;
const getEntriesForDaysMock = getEntriesForDays as jest.MockedFunction<typeof getEntriesForDays>;
const getLeaveRangesInRangeMock = getLeaveRangesInRange as jest.MockedFunction<typeof getLeaveRangesInRange>;
const createNativeWorkReportMock = createNativeWorkReport as jest.MockedFunction<typeof createNativeWorkReport>;

const days: Day[] = [
  {
    id: 1,
    date: '2026-06-26',
    started_at: null,
    ended_at: null,
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: '2026-06-26T00:00:00.000Z',
    updated_at: '2026-06-26T00:00:00.000Z',
  },
  {
    id: 2,
    date: '2026-07-25',
    started_at: '2026-07-25T08:00:00.000Z',
    ended_at: '2026-07-25T16:00:00.000Z',
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: '2026-07-25T00:00:00.000Z',
    updated_at: '2026-07-25T00:00:00.000Z',
  },
];

const options = {
  personName: 'Ada Example',
  companyName: 'Example Oy',
  startDate: '2026-06-26',
  endDate: '2026-07-25',
  language: 'en' as const,
  type: 'hours' as const,
};

beforeEach(() => {
  jest.resetAllMocks();
  getDaysInRangeMock.mockResolvedValue(days);
  getEntriesForDaysMock.mockResolvedValue([]);
  getLeaveRangesInRangeMock.mockResolvedValue([]);
  createNativeWorkReportMock.mockResolvedValue(undefined);
});

describe('exportWorkReport', () => {
  it('builds a report from the range and hands it to the print UI', async () => {
    await expect(exportWorkReport(options)).resolves.toBeUndefined();

    expect(getDaysInRange).toHaveBeenCalledWith('2026-06-26', '2026-07-25');
    expect(getEntriesForDays).toHaveBeenCalledWith([1, 2]);
    expect(getLeaveRangesInRange).toHaveBeenCalledWith('2026-06-26', '2026-07-25');
    // The native side takes a finished, self-contained document — it has no
    // model to parse and nowhere to fetch from.
    expect(createNativeWorkReport).toHaveBeenCalledWith(
      expect.stringMatching(/^<!doctype html>/),
      'work-report-2026-06-26-to-2026-07-25.pdf',
      42,
    );
    const [html] = createNativeWorkReportMock.mock.calls[0];
    expect(html).toContain('<table class="sheet-table">');
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
  });

  it('wraps database read failures and stops before rendering', async () => {
    getDaysInRangeMock.mockRejectedValue(new Error('SQLite unavailable'));

    await expect(exportWorkReport(options)).rejects.toThrow('report_read_failed');
    expect(createNativeWorkReport).not.toHaveBeenCalled();
  });

  it('wraps native render failures with a stable code', async () => {
    createNativeWorkReportMock.mockRejectedValue(new Error('Native renderer failed'));

    await expect(exportWorkReport(options)).rejects.toThrow('report_render_failed');
  });

  it('does not print a report with a blank company', async () => {
    await expect(exportWorkReport({...options, companyName: ' '}))
      .rejects.toThrow('report_company_required');
    expect(createNativeWorkReport).not.toHaveBeenCalled();
  });

  it('does not print a report without positive day rows', async () => {
    getDaysInRangeMock.mockResolvedValue([days[0]]);

    await expect(exportWorkReport(options)).rejects.toThrow('report_empty');
    expect(createNativeWorkReport).not.toHaveBeenCalled();
  });
});
