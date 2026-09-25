import {useQuery} from '../hooks/useQuery.ts';
import {usePhoneState} from '../hooks/usePhoneState.ts';
import {ACTIVITY_LABEL, addDays, clock, dayLabel, formatHours, monthOf, todayIso} from '../lib/format.ts';
import {calcDayWorkBreakdown} from '../../../../src/utils/hoursUtils.ts';
import {Bars, DAY_CEILING_HOURS} from './Insights.tsx';

interface Props {
  onOpenDay: (date: string) => void;
  onOpenEntry: (date: string, id: number) => void;
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

/**
 * The landing view: today, this week, this month at a glance, then the
 * week's daily hours and today's notes. Everything is the phone's own
 * numbers (insights / monthSummary / dayDetail); this only lays them out,
 * with room to breathe.
 */
export function Home({onOpenDay, onOpenEntry}: Props) {
  const today = todayIso();
  const phone = usePhoneState();
  const week = useQuery('insights', 'week', 'all');
  const month = useQuery('monthSummary', monthOf(today));
  const detail = useQuery('dayDetail', today);

  if (week === undefined || month === undefined || detail === undefined) return <p className="muted home">…</p>;
  if (week === null || month === null) {
    return <p className="muted home">No data yet — pair the phone and it will push its database here.</p>;
  }

  const day = detail?.day && detail.day.id > 0 ? detail.day : null;
  const entries = detail?.entries ?? [];
  const todaySecs = day ? calcDayWorkBreakdown(day, entries).workSeconds : 0;
  const todayStatus = !day
    ? 'Not started'
    : day.ended_at
    ? `${clock(day.started_at)} – ${clock(day.ended_at)}`
    : day.started_at
    ? `Started ${clock(day.started_at)}`
    : 'Day open';

  const weekSecs = Object.values(week.work.byDay).reduce((s, v) => s + v, 0);
  const targetSecs = week.weeklyTargetHours * 3600;
  const targetPct = targetSecs > 0 ? Math.min(1, weekSecs / targetSecs) : 0;
  const weekDays = Array.from({length: 7}, (_v, i) => addDays(week.start, i));
  const elapsed = weekDays.filter(d => d <= today).length;

  const daysWorked = month.days.filter(d => d.workSeconds > 0).length;

  const m = week.movement;
  const h = week.health;
  const habits = week.habits.slice(0, 4);
  const hasHabits = habits.length > 0;
  const hasMovement = m.footSec > 0 || m.cycleSec > 0;
  const hasHealth = h.steps != null || h.sleep != null;

  const listed = [...entries].filter(e => e.parent_id == null).sort((a, b) => (a.time_from ?? '').localeCompare(b.time_from ?? ''));

  return (
    <div className="home">
      <header className="home-head">
        <h1>{dayLabel(today)}</h1>
        {phone.activeSession && (
          <span className="status">
            ▶ {phone.activeSession.name || phone.activeSession.title || 'Timer'} since {clock(phone.activeSession.started_at)}
          </span>
        )}
      </header>

      <div className="tiles">
        <button className="tile link" onClick={() => onOpenDay(today)}>
          <span className="eyebrow">Today</span>
          <span className="big num">{formatHours(todaySecs)}</span>
          <span className="sub">
            {todayStatus} · {entries.length} {entries.length === 1 ? 'note' : 'notes'}
          </span>
        </button>
        <div className="tile">
          <span className="eyebrow">This week</span>
          <span className="big num">{formatHours(weekSecs)}</span>
          <span className="sub">
            {week.weeklyTargetHours > 0 ? `${Math.round(targetPct * 100)} % of ${week.weeklyTargetHours} h` : `${elapsed} days`}
          </span>
          {week.weeklyTargetHours > 0 && (
            <div className="track">
              <div className="fill" style={{width: `${Math.max(1, targetPct * 100)}%`}} />
            </div>
          )}
        </div>
        <div className="tile">
          <span className="eyebrow">This month</span>
          <span className="big num">{formatHours(month.totalWorkSeconds)}</span>
          <span className="sub">
            {daysWorked} {daysWorked === 1 ? 'day' : 'days'} worked
          </span>
        </div>
      </div>

      <section>
        <Bars title="Hours by day" days={weekDays.map(d => ({key: d, label: weekdayShort(d), value: (week.work.byDay[d] ?? 0) / 3600, isToday: d === today}))} color="var(--primary)" ceiling={DAY_CEILING_HOURS} />
      </section>

      {(hasHabits || hasMovement || hasHealth) && (
        <div className="tiles">
          {hasHabits && (
            <div className="tile">
              <span className="eyebrow">Habits this week</span>
              <ul className="mini">
                {habits.map(r => (
                  <li key={r.id}>
                    <span>{r.title}</span>
                    <span className="num muted">
                      {r.done} / {elapsed}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasMovement && (
            <div className="tile">
              <span className="eyebrow">On the move</span>
              <ul className="mini">
                {m.footSec > 0 && (
                  <li>
                    <span>Walking</span>
                    <span className="num muted">{km(m.footM)}</span>
                  </li>
                )}
                {m.cycleSec > 0 && (
                  <li>
                    <span>Cycling</span>
                    <span className="num muted">{km(m.cycleM)}</span>
                  </li>
                )}
                {m.vehicleSec > 0 && (
                  <li>
                    <span>Driving</span>
                    <span className="num muted">{km(m.vehicleM)}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
          {hasHealth && (
            <div className="tile">
              <span className="eyebrow">Health</span>
              <ul className="mini">
                {h.steps != null && (
                  <li>
                    <span>Steps</span>
                    <span className="num muted">{h.steps} / day</span>
                  </li>
                )}
                {h.sleep != null && (
                  <li>
                    <span>Sleep</span>
                    <span className="num muted">{hm(h.sleep)}</span>
                  </li>
                )}
                {h.hr != null && (
                  <li>
                    <span>Resting HR</span>
                    <span className="num muted">{h.hr} bpm</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <section>
        <h2>Today’s notes</h2>
        {listed.length === 0 ? (
          <p className="muted">Nothing yet today.</p>
        ) : (
          <div className="list">
            {listed.map(e => (
              <button key={e.id} className="row" onClick={() => onOpenEntry(today, e.id)}>
                <span className="t num">{clock(e.time_from)}</span>
                <span className={`name ${e.activity_type}`}>{e.title || e.entry_type}</span>
                <span className="meta">{e.project?.name ?? ACTIVITY_LABEL[e.activity_type]}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function weekdayShort(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {weekday: 'short'});
}
