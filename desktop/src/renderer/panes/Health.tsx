import {clock} from '../lib/format.ts';
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
