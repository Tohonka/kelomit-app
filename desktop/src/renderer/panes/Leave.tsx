import {useState} from 'react';
import {useQuery} from '../hooks/useQuery.ts';
import {LEAVE_LABEL} from '../lib/format.ts';
import type {LeaveRange, LeaveType} from '../../../../src/types/index.ts';

const TYPES = Object.keys(LEAVE_LABEL) as LeaveType[];

const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});

/** Leave ranges of a year: add, change inline, delete. The phone enforces
 *  overlap rules and reports a refusal through the queue's failed list. */
export function Leave({year}: {year: number}) {
  const ranges = useQuery('listLeave', year) ?? [];
  const [type, setType] = useState<LeaveType>('vacation');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const add = () => {
    if (!start) return;
    const input = {type, startDate: start, endDate: end || start};
    cmd('leaveRanges.create', [input], `Leave ${LEAVE_LABEL[type]} ${input.startDate}–${input.endDate}`);
    setStart('');
    setEnd('');
  };
  const update = (r: LeaveRange, patch: Partial<{type: LeaveType; startDate: string; endDate: string}>) => {
    const input = {type: r.type, startDate: r.start_date, endDate: r.end_date, ...patch};
    if (!input.startDate || !input.endDate) return;
    cmd('leaveRanges.update', [r.id, input], `Change leave ${input.startDate}–${input.endDate}`);
  };
  const remove = (r: LeaveRange) => {
    if (confirm(`Delete ${LEAVE_LABEL[r.type]} ${r.start_date}–${r.end_date}?`)) {
      cmd('leaveRanges.delete', [r.id], `Delete leave ${r.start_date}–${r.end_date}`);
    }
  };

  return (
    <div className="leave">
      <h2>Leave {year}</h2>
      <div className="add">
        <select value={type} onChange={e => setType(e.target.value as LeaveType)}>
          {TYPES.map(t => (
            <option key={t} value={t}>
              {LEAVE_LABEL[t]}
            </option>
          ))}
        </select>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} />
        <button className="btn primary" onClick={add}>
          Add
        </button>
      </div>
      <table>
        <tbody>
          {ranges.map(r => (
            <tr key={r.id}>
              <td>
                <select value={r.type} onChange={e => update(r, {type: e.target.value as LeaveType})}>
                  {TYPES.map(t => (
                    <option key={t} value={t}>
                      {LEAVE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input type="date" value={r.start_date} onChange={e => update(r, {startDate: e.target.value})} />
              </td>
              <td>
                <input type="date" value={r.end_date} min={r.start_date} onChange={e => update(r, {endDate: e.target.value})} />
              </td>
              <td className="actions">
                <button className="btn small danger" onClick={() => remove(r)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {ranges.length === 0 && (
            <tr>
              <td className="muted">No leave recorded in {year}.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
