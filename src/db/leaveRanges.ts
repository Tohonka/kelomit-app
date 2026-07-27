import {getDB} from './database';
import type {LeaveRange, LeaveType} from '../types';
import {eachDayOfInterval, format, parseISO} from 'date-fns';

type Row = Record<string, unknown>;

export interface CreateLeaveRangeInput {
  type: LeaveType;
  startDate: string;
  endDate: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function rowToLeaveRange(row: Row): LeaveRange {
  return {
    id: row.id as number,
    type: row.type as LeaveType,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function validateLeaveRange(startDate: string, endDate: string): void {
  if (!DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate) {
    throw new Error('leave_invalid_range');
  }
}

export function canLeaveTypesOverlap(
  left: LeaveType,
  right: LeaveType,
): boolean {
  return (
    (left === 'vacation' && right === 'sick') ||
    (left === 'sick' && right === 'vacation')
  );
}

export function leavesByDate(
  ranges: LeaveRange[],
  startDate: string,
  endDate: string,
): Record<string, LeaveRange[]> {
  validateLeaveRange(startDate, endDate);
  const result: Record<string, LeaveRange[]> = {};
  for (const range of ranges) {
    const start = range.start_date < startDate ? startDate : range.start_date;
    const end = range.end_date > endDate ? endDate : range.end_date;
    if (start > end) { continue; }
    for (const day of eachDayOfInterval({
      start: parseISO(start),
      end: parseISO(end),
    })) {
      const key = format(day, 'yyyy-MM-dd');
      (result[key] ??= []).push(range);
    }
  }
  return result;
}

export async function getLeaveRange(id: number): Promise<LeaveRange | null> {
  const result = await getDB().execute(
    'SELECT * FROM leave_ranges WHERE id = ?;',
    [id],
  );
  const row = result.rows?.[0] as Row | undefined;
  return row ? rowToLeaveRange(row) : null;
}

export async function getLeaveRangesInRange(
  startDate: string,
  endDate: string,
): Promise<LeaveRange[]> {
  validateLeaveRange(startDate, endDate);
  const result = await getDB().execute(
    `SELECT * FROM leave_ranges
     WHERE start_date <= ? AND end_date >= ?
     ORDER BY start_date ASC, id ASC;`,
    [endDate, startDate],
  );
  return (result.rows ?? []).map(row => rowToLeaveRange(row as Row));
}

async function assertAllowedOverlap(
  execute: ReturnType<typeof getDB>['execute'],
  input: CreateLeaveRangeInput,
  excludeId?: number,
): Promise<void> {
  const exclusion = excludeId == null ? '' : ' AND id <> ?';
  const params: (string | number)[] = [input.endDate, input.startDate];
  if (excludeId != null) {
    params.push(excludeId);
  }
  const result = await execute(
    `SELECT * FROM leave_ranges
     WHERE start_date <= ? AND end_date >= ?${exclusion};`,
    params,
  );
  const overlap = (result.rows ?? [])
    .map(row => rowToLeaveRange(row as Row))
    .some(existing => !canLeaveTypesOverlap(input.type, existing.type));
  if (overlap) {
    throw new Error('leave_overlap');
  }
}

export async function createLeaveRange(
  input: CreateLeaveRangeInput,
): Promise<LeaveRange> {
  validateLeaveRange(input.startDate, input.endDate);
  let created: LeaveRange | null = null;
  await getDB().transaction(async tx => {
    await assertAllowedOverlap(tx.execute.bind(tx), input);
    const result = await tx.execute(
      `INSERT INTO leave_ranges (type, start_date, end_date)
       VALUES (?, ?, ?) RETURNING *;`,
      [input.type, input.startDate, input.endDate],
    );
    const row = result.rows?.[0] as Row | undefined;
    if (!row) {
      throw new Error('leave_not_found');
    }
    created = rowToLeaveRange(row);
  });
  return created!;
}

export async function updateLeaveRange(
  id: number,
  input: CreateLeaveRangeInput,
): Promise<LeaveRange> {
  validateLeaveRange(input.startDate, input.endDate);
  let updated: LeaveRange | null = null;
  await getDB().transaction(async tx => {
    await assertAllowedOverlap(tx.execute.bind(tx), input, id);
    const result = await tx.execute(
      `UPDATE leave_ranges
       SET type = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *;`,
      [input.type, input.startDate, input.endDate, id],
    );
    const row = result.rows?.[0] as Row | undefined;
    if (!row) {
      throw new Error('leave_not_found');
    }
    updated = rowToLeaveRange(row);
  });
  return updated!;
}

export async function deleteLeaveRange(id: number): Promise<void> {
  const result = await getDB().execute(
    'DELETE FROM leave_ranges WHERE id = ?;',
    [id],
  );
  if ((result.rowsAffected ?? 0) === 0) {
    throw new Error('leave_not_found');
  }
}
