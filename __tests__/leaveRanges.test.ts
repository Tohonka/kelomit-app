const mockExecute = jest.fn();
const mockTransaction = jest.fn(async (work: (tx: {execute: typeof mockExecute}) => Promise<unknown>) =>
  work({execute: mockExecute}));

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute, transaction: mockTransaction}),
}));

import {migrations} from '../src/db/migrations';
import {
  canLeaveTypesOverlap,
  createLeaveRange,
  getLeaveRangesInRange,
  updateLeaveRange,
  validateLeaveRange,
} from '../src/db/leaveRanges';

beforeEach(() => {
  jest.clearAllMocks();
});

it('adds overtime and leave storage in migration 23', () => {
  const sql = migrations.find(item => item.version === 23)?.up.join('\n') ?? '';
  expect(sql).toContain('ALTER TABLE entries ADD COLUMN is_overtime');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS leave_ranges');
  expect(sql).toContain(
    "CHECK(type IN ('paid_day_off','unpaid_day_off','vacation','sick'))",
  );
  expect(sql).toContain('idx_leave_ranges_dates');
  expect(sql).toContain("'pay_period_start_day', '1'");
});

it('allows only vacation and sick to overlap', () => {
  expect(canLeaveTypesOverlap('vacation', 'sick')).toBe(true);
  expect(canLeaveTypesOverlap('sick', 'vacation')).toBe(true);
  expect(canLeaveTypesOverlap('vacation', 'vacation')).toBe(false);
  expect(canLeaveTypesOverlap('paid_day_off', 'sick')).toBe(false);
});

it('rejects reversed leave ranges', () => {
  expect(() => validateLeaveRange('2026-07-26', '2026-07-25'))
    .toThrow('leave_invalid_range');
});

it('loads ranges that intersect the requested dates', async () => {
  mockExecute.mockResolvedValueOnce({
    rows: [{
      id: 4,
      type: 'vacation',
      start_date: '2026-07-20',
      end_date: '2026-07-30',
      created_at: '2026-07-01 10:00:00',
      updated_at: '2026-07-01 10:00:00',
    }],
  });

  await expect(
    getLeaveRangesInRange('2026-07-25', '2026-07-31'),
  ).resolves.toHaveLength(1);
  expect(mockExecute).toHaveBeenCalledWith(
    expect.stringContaining('start_date <= ? AND end_date >= ?'),
    ['2026-07-31', '2026-07-25'],
  );
});

it('creates a non-overlapping range inside one transaction', async () => {
  mockExecute
    .mockResolvedValueOnce({rows: []})
    .mockResolvedValueOnce({
      rows: [{
        id: 5,
        type: 'paid_day_off',
        start_date: '2026-08-03',
        end_date: '2026-08-03',
        created_at: '2026-07-27 10:00:00',
        updated_at: '2026-07-27 10:00:00',
      }],
    });

  await expect(createLeaveRange({
    type: 'paid_day_off',
    startDate: '2026-08-03',
    endDate: '2026-08-03',
  })).resolves.toMatchObject({id: 5, type: 'paid_day_off'});
  expect(mockTransaction).toHaveBeenCalledTimes(1);
});

it('accepts sick leave over vacation but rejects other overlaps', async () => {
  const vacation = {
    id: 1,
    type: 'vacation',
    start_date: '2026-08-01',
    end_date: '2026-08-14',
    created_at: '',
    updated_at: '',
  };
  mockExecute
    .mockResolvedValueOnce({rows: [vacation]})
    .mockResolvedValueOnce({
      rows: [{
        ...vacation,
        id: 2,
        type: 'sick',
        start_date: '2026-08-05',
        end_date: '2026-08-06',
      }],
    });
  await expect(createLeaveRange({
    type: 'sick',
    startDate: '2026-08-05',
    endDate: '2026-08-06',
  })).resolves.toMatchObject({type: 'sick'});

  mockExecute.mockReset();
  mockExecute.mockResolvedValueOnce({rows: [vacation]});
  await expect(createLeaveRange({
    type: 'paid_day_off',
    startDate: '2026-08-05',
    endDate: '2026-08-06',
  })).rejects.toThrow('leave_overlap');
});

it('excludes the edited range from overlap validation', async () => {
  mockExecute
    .mockResolvedValueOnce({rows: []})
    .mockResolvedValueOnce({
      rows: [{
        id: 9,
        type: 'vacation',
        start_date: '2026-09-01',
        end_date: '2026-09-10',
        created_at: '',
        updated_at: '',
      }],
    });

  await updateLeaveRange(9, {
    type: 'vacation',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
  });

  expect(mockExecute.mock.calls[0][0]).toContain('id <> ?');
  expect(mockExecute.mock.calls[0][1]).toEqual([
    '2026-09-10',
    '2026-09-01',
    9,
  ]);
});
