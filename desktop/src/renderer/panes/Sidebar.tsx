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

/** Month grid (Monday first): worked hours under the day, a dot for days that
 *  only have notes. The grid is the overview; counts live in the day view. */
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
      <div className="month-total">
        {summary ? `${formatHours(summary.totalWorkSeconds)} worked` : summary === null ? 'no data' : '…'}
      </div>
    </div>
  );
}
