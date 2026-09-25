import {useState} from 'react';
import {useQuery} from '../hooks/useQuery.ts';
import {ACTIVITY_LABEL, addDays, formatHours} from '../lib/format.ts';
import type {Insights as Data, Period, Scope, Slice} from '../../main/insights.ts';
import type {Pattern, SeriesKey} from '../../../../src/utils/patterns.ts';
import {MIN_DAYS} from '../../../../src/utils/patterns.ts';

/*
 * The phone's Insights ("Balance") screen: one picture of the period — Work /
 * Movement / Habits / Food / Energy / Health / Patterns. It shows, it never
 * grades. All the maths is in main/insights.ts; this only formats.
 */
const PERIODS: [Period, string][] = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['last30', 'Last 30 days'],
];
const SCOPES: [Scope, string][] = [
  ['all', 'All'],
  ['work', 'Work'],
  ['personal', 'Personal'],
];
const CYCLE = ['var(--work)', 'var(--personal)', 'var(--personalWork)'];
const ACTIVITY_COLOR: Record<string, string> = {
  work: 'var(--work)',
  personal_work: 'var(--personalWork)',
  personal: 'var(--personal)',
};
export const DAY_CEILING_HOURS = 9;
const PATTERN_DAYS = 90;

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const duration = (sec: number) => formatHours(sec) || `${Math.round(sec / 60)} min`;

function fmtSeries(key: SeriesKey, v: number): string {
  switch (key) {
    case 'sleep':
      return `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, '0')}`;
    case 'steps':
      return String(Math.round(v / 100) * 100);
    case 'exercise':
      return `${Math.round(v)} min`;
    case 'kcal':
      return `${Math.round(v / 10) * 10} kcal`;
    case 'work':
      return `${v.toFixed(1)} h`;
    case 'habits':
      return `${Math.round(v)} %`;
  }
}
const SERIES: Record<SeriesKey, string> = {
  sleep: 'sleep',
  steps: 'steps',
  exercise: 'exercise',
  kcal: 'eating',
  work: 'work',
  habits: 'habits done',
};

function sentence(p: Pattern): string {
  const x = SERIES[p.x];
  const y = SERIES[p.y];
  const cmp = p.inclusive ? 'at most' : 'under';
  const t = fmtSeries(p.x, p.threshold);
  const low = fmtSeries(p.y, p.lowMean);
  const high = fmtSeries(p.y, p.highMean);
  return p.lag === 1
    ? `Days with ${x} ${cmp} ${t}: the next day’s ${y} averaged ${low}. Other days: ${high}.`
    : `Days with ${x} ${cmp} ${t}: ${y} averaged ${low}. Other days: ${high}.`;
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  isToday: boolean;
}

/** One bar per day, scaled to the tallest (or a ceiling) — the phone's DayBars. */
export function Bars({days, color, ceiling, title}: {days: Bar[]; color: string; ceiling?: number; title: string}) {
  const max = ceiling ?? Math.max(1, ...days.map(d => d.value));
  return (
    <>
      <h3 className="eyebrow">{title}</h3>
      <div className="card bars">
        {days.map(d => (
          <div key={d.key} className="col" title={String(d.value)}>
            <div className="track">
              <div
                className="bar"
                style={{
                  height: `${Math.max(d.value > 0 ? 4 : 0, Math.min(1, d.value / max) * 100)}%`,
                  background: d.value > 0 ? color : 'var(--bgMuted)',
                }}
              />
            </div>
            <span className={`lbl${d.isToday ? ' today' : ''}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Breakdown({
  title,
  slices,
  total,
  colorFor,
}: {
  title: string;
  slices: Slice[];
  total: number;
  colorFor: (s: Slice, i: number) => string;
}) {
  if (slices.length === 0) return null;
  return (
    <>
      <h3 className="eyebrow">{title}</h3>
      <div className="card">
        {slices.map((s, i) => {
          const pct = total > 0 ? Math.round((s.seconds / total) * 100) : 0;
          return (
            <div key={s.key} className="break">
              <div className="top">
                <span className="lbl">{ACTIVITY_LABEL[s.label] ?? s.label}</span>
                <span className="muted num">
                  {formatHours(s.seconds)} · {pct}%
                </span>
              </div>
              <div className="track">
                <div className="fill" style={{width: `${Math.max(3, pct)}%`, background: colorFor(s, i)}} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className="num">{value}</strong>
    </div>
  );
}

export function Insights() {
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<Scope>('all');
  const d = useQuery('insights', period, scope);

  if (d === undefined) return <p className="muted">…</p>;
  if (d === null) return <p className="muted">No data yet.</p>;

  const isWeek = period === 'week';
  const weekDays = Array.from({length: 7}, (_v, i) => addDays(d.start, i));
  const bars = (valueOf: (date: string) => number): Bar[] =>
    weekDays.map(date => ({
      key: date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {weekday: 'short'}),
      value: valueOf(date),
      isToday: date === d.today,
    }));
  const dayCount = weekDays.filter(x => x <= d.end).length;
  const periodDays =
    period === 'week'
      ? dayCount
      : Math.round((new Date(`${d.end}T12:00:00`).getTime() - new Date(`${d.start}T12:00:00`).getTime()) / 86_400_000) + 1;

  const workedSecs = Object.values(d.work.byDay).reduce((s, v) => s + v, 0);
  const showWorked = scope !== 'personal' && workedSecs > 0;
  const hasWork = d.work.totalSeconds > 0 || showWorked;
  const m = d.movement;
  const hasMovement = m.footSec + m.cycleSec + m.vehicleSec > 0;
  const h = d.health;
  const hasHealth = h.steps != null || h.sleep != null || h.weightTo != null || h.hr != null;
  const hasAnything = hasWork || hasMovement || d.habits.length > 0 || d.food.entries > 0 || hasHealth;
  const targetSecs = d.weeklyTargetHours * 3600;
  const targetPct = targetSecs > 0 ? Math.min(1, workedSecs / targetSecs) : 0;

  return (
    <div className="insights">
      <div className="row">
        <span className="seg">
          {PERIODS.map(([k, label]) => (
            <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>
              {label}
            </button>
          ))}
        </span>
        <span className="seg">
          {SCOPES.map(([k, label]) => (
            <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>
              {label}
            </button>
          ))}
        </span>
      </div>

      {!hasAnything && <p className="muted">Nothing tracked in this period yet.</p>}

      {hasWork && (
        <section>
          <h2>Work</h2>
          {isWeek && scope !== 'personal' && (
            <>
              <div className="card ring">
                <div className="pct">
                  <strong>{Math.round(targetPct * 100)}%</strong>
                  <span className="muted">of target</span>
                </div>
                <div>
                  <span className="muted">Tracked this week</span>
                  <div className="big num">{formatHours(workedSecs)}</div>
                  <span className="muted">of {d.weeklyTargetHours}h target</span>
                  <div className="track">
                    <div className="fill" style={{width: `${Math.max(1, targetPct * 100)}%`, background: 'var(--primary)'}} />
                  </div>
                </div>
              </div>
              <Bars
                title="Daily hours"
                days={bars(k => (d.work.byDay[k] ?? 0) / 3600)}
                color="var(--primary)"
                ceiling={DAY_CEILING_HOURS}
              />
            </>
          )}
          {!isWeek && showWorked && (
            <div className="card ring">
              <div className="pct">
                <strong className="num">{formatHours(workedSecs)}</strong>
                <span className="muted">work</span>
              </div>
              <div>
                <span className="muted">Total tracked</span>
                <div className="big num">{formatHours(d.work.totalSeconds)}</div>
                <span className="muted">of {formatHours(workedSecs)} worked</span>
              </div>
            </div>
          )}
          <Breakdown
            title="By activity"
            slices={d.work.byActivity}
            total={d.work.totalSeconds}
            colorFor={s => ACTIVITY_COLOR[s.key] ?? CYCLE[0]}
          />
          <Breakdown title="By project" slices={d.work.byProject} total={d.work.totalSeconds} colorFor={(_s, i) => CYCLE[i % 3]} />
          <Breakdown title="By tag" slices={d.work.byTag} total={d.work.totalSeconds} colorFor={(_s, i) => CYCLE[i % 3]} />
        </section>
      )}

      {hasMovement && (
        <section>
          <h2>Movement</h2>
          <div className="card">
            {m.footSec > 0 && <Stat label="Walking" value={`${duration(m.footSec)} · ${km(m.footM)}`} />}
            {m.cycleSec > 0 && <Stat label="Cycling" value={`${duration(m.cycleSec)} · ${km(m.cycleM)}`} />}
            {m.vehicleSec > 0 && <Stat label="Driving" value={`${duration(m.vehicleSec)} · ${km(m.vehicleM)}`} />}
            {m.stillSec > 0 && <Stat label="Stationary" value={duration(m.stillSec)} />}
            <p className="muted note">
              {m.kcal != null
                ? `~${m.kcal} kcal from moving (estimate)`
                : 'Add your weight in the phone’s Settings → Health for an energy estimate'}
            </p>
          </div>
          {isWeek && <Bars title="Walking minutes" days={bars(k => Math.round((m.footSecByDay[k] ?? 0) / 60))} color="var(--personal)" />}
        </section>
      )}

      {d.habits.length > 0 && (
        <section>
          <h2>Habits</h2>
          <div className="card">
            {d.habits.map((r, i) => {
              const pct = periodDays > 0 ? Math.round((r.done / periodDays) * 100) : 0;
              return (
                <div key={r.id} className="break">
                  <div className="top">
                    <span className="lbl">{r.title}</span>
                    <span className="muted num">
                      {r.done} / {periodDays} days
                    </span>
                  </div>
                  <div className="track">
                    <div className="fill" style={{width: `${Math.max(3, pct)}%`, background: CYCLE[i % 3]}} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {d.food.entries > 0 && (
        <section>
          <h2>Food</h2>
          <div className="card">
            <Stat label="Total" value={`${d.food.kcal} kcal · ${d.food.entries} entries`} />
            <Stat
              label="Average"
              value={`${d.food.days > 0 ? Math.round(d.food.kcal / d.food.days) : 0} kcal / day on ${d.food.days} days`}
            />
            {d.food.noKcal > 0 && <p className="muted note">{d.food.noKcal} without kcal</p>}
          </div>
          {isWeek && <Bars title="Daily kcal" days={bars(k => d.food.byDay[k]?.kcal ?? 0)} color="var(--personalWork)" />}
        </section>
      )}

      {d.energy.bmr != null && d.energy.days > 0 && (
        <section>
          <h2>Energy</h2>
          <div className="card">
            <Stat label="BMR" value={`${d.energy.bmr} kcal/day`} />
            <Stat label="Used (estimate)" value={`${d.energy.used} kcal · ${d.energy.usedAvg}/day`} />
            {d.energy.eatenDays > 0 && (
              <Stat label={`Eaten (${d.energy.eatenDays} logged days)`} value={`${d.energy.eaten} kcal · ${d.energy.eatenAvg}/day`} />
            )}
            <p className="muted note">Finished days only. Estimates, not measurements.</p>
          </div>
          {isWeek && <Bars title="Energy used per day" days={bars(k => d.energy.usedByDay[k] ?? 0)} color="var(--personal)" />}
        </section>
      )}
      {d.energy.bmr == null && hasAnything && (
        <p className="muted note">
          Energy use needs your{' '}
          {d.energy.missing.map(f => ({weight: 'weight', height: 'height', birthYear: 'birth year', sex: 'sex'}[f])).join(', ')} — fill them
          in on the phone (profile).
        </p>
      )}

      {hasHealth && (
        <section>
          <h2>Health</h2>
          <div className="card">
            {h.steps != null && <Stat label="Steps" value={`${h.steps} / day`} />}
            {h.sleep != null && <Stat label="Sleep" value={`${hm(h.sleep)} / night`} />}
            {h.weightTo != null && (
              <Stat label="Weight" value={`${(h.weightFrom ?? h.weightTo).toFixed(1)} → ${h.weightTo.toFixed(1)} kg`} />
            )}
            {h.hr != null && <Stat label="Resting heart rate" value={`${h.hr} bpm`} />}
          </div>
          {isWeek && h.steps != null && <Bars title="Daily steps" days={bars(k => h.stepsByDay[k] ?? 0)} color="var(--work)" />}
        </section>
      )}

      {d.patterns.days > 0 && (
        <section>
          <h2>Patterns</h2>
          <div className="card">
            {d.patterns.list.length === 0 ? (
              <p className="muted note">
                {d.patterns.days < MIN_DAYS * 2
                  ? `${d.patterns.days} usable days so far — patterns need about ${MIN_DAYS * 2}.`
                  : 'Nothing stands out yet.'}
              </p>
            ) : (
              <>
                {d.patterns.list.map(p => (
                  <p key={`${p.x}-${p.y}`} className="pattern">
                    {sentence(p)}
                  </p>
                ))}
                <p className="muted note">
                  Last {PATTERN_DAYS} days, split at the median. Coincidences happen — these are observations, not causes.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
