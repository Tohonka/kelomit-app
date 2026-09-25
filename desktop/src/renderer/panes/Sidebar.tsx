import {useQuery} from '../hooks/useQuery.ts';
import {addMonths, compactHours, formatHours, monthLabel, todayIso} from '../lib/format.ts';
import type {MonthDay} from '../../main/queries.ts';

interface Props {
  month: string;
  date: string;
  onMonth: (month: string) => void;
  onDate: (date: string) => void;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Month grid (Monday first) + the month's days as a list, worked hours on both. */
export function Sidebar({month, date, onMonth, onDate}: Props) {
  const summary = useQuery('monthSummary', month);
  const byDate = new Map<string, MonthDay>((summary?.days ?? []).map(d => [d.date, d]));
  const today = todayIso();

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({length: daysInMonth}, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  const listed = [...(summary?.days ?? [])].reverse();

  return (
    <div className="sidebar">
      <div className="month-nav">
        <button className="btn" onClick={() => onMonth(addMonths(month, -1))} title="Previous month">
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn" onClick={() => onMonth(addMonths(month, 1))} title="Next month">
          ›
        </button>
      </div>
      <div className="month-total">
        {summary ? formatHours(summary.totalWorkSeconds) : summary === null ? 'no data' : '…'}
      </div>
      <div className="month-grid">
        {WEEKDAYS.map(w => (
          <span key={w} className="wd">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const md = byDate.get(d);
          const cls = [
            'cell',
            d === date ? 'selected' : '',
            d === today ? 'today' : '',
            md?.leaves.length ? 'leave' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button key={d} className={cls} onClick={() => onDate(d)}>
              <span className="n">{Number(d.slice(8))}</span>
              {md && md.workSeconds > 0 ? (
                <span className="h">{compactHours(md.workSeconds)}</span>
              ) : (
                md && md.entryCount > 0 && <span className="dot" />
              )}
            </button>
          );
        })}
      </div>
      <div className="day-list">
        {listed.map(d => (
          <button
            key={d.date}
            className={`day-row${d.date === date ? ' selected' : ''}`}
            onClick={() => onDate(d.date)}>
            <span className="d">{d.date.slice(8)}</span>
            <span className="meta">
              {d.leaves.length
                ? 'leave'
                : `${d.entryCount} ${d.entryCount === 1 ? 'entry' : 'entries'}`}
            </span>
            <span className="h">{d.workSeconds > 0 ? formatHours(d.workSeconds) : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
