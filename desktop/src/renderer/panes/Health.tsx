import {useQuery} from '../hooks/useQuery.ts';
import {addMonths, clock, monthLabel} from '../lib/format.ts';
import type {HealthDaily} from '../../../../src/types/index.ts';

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

/** The day's Health Connect totals, read-only (the phone imports them). */
export function HealthCard({health}: {health: HealthDaily}) {
  const rows: [string, string][] = [];
  if (health.steps != null) rows.push(['Steps', String(health.steps)]);
  if (health.distance_m != null) rows.push(['Distance', `${(health.distance_m / 1000).toFixed(1)} km`]);
  if (health.sleep_minutes != null) {
    rows.push(['Sleep', `${hm(health.sleep_minutes)}${health.sleep_start && health.sleep_end ? ` · ${clock(health.sleep_start)}–${clock(health.sleep_end)}` : ''}`]);
  }
  if (health.exercise && health.exercise.length > 0) {
    const min = health.exercise.reduce((s, b) => s + b.minutes, 0);
    rows.push(['Exercise', `${Math.round(min)} min · ${health.exercise.length} session${health.exercise.length === 1 ? '' : 's'}`]);
  }
  if (health.active_kcal != null) rows.push(['Active energy', `${Math.round(health.active_kcal)} kcal`]);
  if (health.total_kcal != null) rows.push(['Total energy', `${Math.round(health.total_kcal)} kcal`]);
  if (health.resting_hr != null) rows.push(['Resting HR', `${health.resting_hr} bpm`]);
  if (health.weight_kg != null) rows.push(['Weight', `${health.weight_kg} kg`]);
  return (
    <div className="card health-card">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="num">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">Synced from Health Connect {clock(health.synced_at)} · read-only</p>
    </div>
  );
}

interface LogProps {
  month: string;
  onMonth: (m: string) => void;
  onOpen: (date: string) => void;
}

const COLS: [string, (h: HealthDaily) => string][] = [
  ['Steps', h => (h.steps != null ? String(h.steps) : '')],
  ['Distance', h => (h.distance_m != null ? `${(h.distance_m / 1000).toFixed(1)} km` : '')],
  ['Sleep', h => (h.sleep_minutes != null ? hm(h.sleep_minutes) : '')],
  ['Exercise', h => (h.exercise && h.exercise.length > 0 ? `${Math.round(h.exercise.reduce((s, b) => s + b.minutes, 0))} min` : '')],
  ['Active', h => (h.active_kcal != null ? `${Math.round(h.active_kcal)} kcal` : '')],
  ['Resting HR', h => (h.resting_hr != null ? `${h.resting_hr} bpm` : '')],
  ['Weight', h => (h.weight_kg != null ? `${h.weight_kg} kg` : '')],
];

/** The month's Health Connect rows as a table, newest first; a row opens its day. */
export function HealthLog({month, onMonth, onOpen}: LogProps) {
  const rows = useQuery('healthMonth', month);
  return (
    <div className="healthlog">
      <div className="month-nav">
        <button className="btn" onClick={() => onMonth(addMonths(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn" onClick={() => onMonth(addMonths(month, 1))}>
          ›
        </button>
        <span className="spacer" />
        <span className="muted">{rows ? `${rows.length} day${rows.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {rows && rows.length === 0 && <p className="muted">Nothing synced from Health Connect this month.</p>}
      {rows && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Day</th>
              {COLS.map(([k]) => (
                <th key={k} className="num">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(h => (
              <tr key={h.date} onClick={() => onOpen(h.date)}>
                <td>{new Date(`${h.date}T12:00:00`).toLocaleDateString(undefined, {weekday: 'short', day: 'numeric'})}</td>
                {COLS.map(([k, f]) => (
                  <td key={k} className="num">
                    {f(h) || <span className="muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
