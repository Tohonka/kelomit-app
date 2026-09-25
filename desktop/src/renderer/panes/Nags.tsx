import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '../hooks/useQuery.ts';
import {dateTimeLabel, fromLocalInput, toLocalInput} from '../lib/format.ts';
import {nextOccurrence} from '../../../../src/utils/nagSchedule.ts';
import type {Nag, NagPlan, NagSchedule} from '../../../../src/types/index.ts';

const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});
const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function scheduleLabel(s: NagSchedule): string {
  if (s.kind === 'once') return dateTimeLabel(s.at);
  if (s.kind === 'dates') return `${s.at.length} date${s.at.length === 1 ? '' : 's'}`;
  const days = s.weekdays.length === 7 ? 'every day' : s.weekdays.map(d => WD[d - 1]).join(' ');
  return `${days} at ${s.time}`;
}

function planLabel(p: NagPlan): string {
  const parts: string[] = [];
  if (p.dayBefore) parts.push(`day before ${p.dayBefore}`);
  if (p.onDay) parts.push(`on the day ${p.onDay}`);
  if (p.hoursBefore) parts.push(`${p.hoursBefore} h before`);
  if (p.repeat) parts.push(`${p.repeat.perHour}×/h −${p.repeat.fromHoursBefore}h…+${p.repeat.untilHoursAfter}h${p.repeat.random ? ' random' : ''}`);
  return parts.join(' · ') || 'at due time';
}

type Edit = {id: number | null} | null;

/** Reminders that keep nagging until done. Alarms fire on the phone; the Mac
 *  only edits the rows and ticks occurrences off. */
export function Nags() {
  const data = useQuery('listNags');
  const [edit, setEdit] = useState<Edit>(null);
  const [showInactive, setShowInactive] = useState(false);
  const doneMap = useMemo(() => new Map(Object.entries(data?.done ?? {})), [data]);
  const now = Date.now();

  if (data === undefined) return <div className="empty">…</div>;
  if (data === null) return <div className="empty">No data yet — pair the phone.</div>;

  const nags = data.nags.filter(n => showInactive || n.active);

  return (
    <div className="nags">
      <div className="list">
        <div className="month-nav">
          <h2>Nags</h2>
          <span className="spacer" />
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> inactive
          </label>
          <button className="btn" onClick={() => setEdit({id: null})}>
            + Nag
          </button>
        </div>
        <table>
          <tbody>
            {nags.map(n => {
              const next = n.active ? nextOccurrence(n, doneMap, now) : null;
              const overdue = next != null && Date.parse(next) < now;
              return (
                <tr key={n.id} className={n.active ? '' : 'archived'}>
                  <td>
                    <input
                      type="checkbox"
                      checked={n.active}
                      title={n.active ? 'Deactivate' : 'Activate'}
                      onChange={e => cmd('nags.update', [n.id, {active: e.target.checked}], `${e.target.checked ? 'Activate' : 'Deactivate'} nag “${n.title}”`)}
                    />
                  </td>
                  <td>
                    <strong>{n.title}</strong>
                    {n.note && <div className="muted">{n.note}</div>}
                  </td>
                  <td className="muted">{n.activity_type}</td>
                  <td>
                    {scheduleLabel(n.schedule)}
                    <div className="muted">{planLabel(n.plan)}</div>
                  </td>
                  <td className={`num${overdue ? ' overdue' : ''}`}>{next ? dateTimeLabel(next) : n.active ? '—' : 'inactive'}</td>
                  <td className="actions">
                    {next && (
                      <button className="btn small primary" onClick={() => cmd('nags.setDone', [n.id, next, true], `Done “${n.title}”`)}>
                        Done
                      </button>
                    )}{' '}
                    <button className="btn small" onClick={() => setEdit({id: n.id})}>
                      Edit
                    </button>{' '}
                    <button
                      className="btn small danger"
                      onClick={() => confirm(`Delete nag “${n.title}”?`) && cmd('nags.delete', [n.id], `Delete nag “${n.title}”`)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {nags.length === 0 && (
              <tr>
                <td className="muted">No nags.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {edit && (
        <aside className="pane editor">
          <NagForm nag={data.nags.find(n => n.id === edit.id) ?? null} onClose={() => setEdit(null)} />
        </aside>
      )}
    </div>
  );
}

function NagForm({nag, onClose}: {nag: Nag | null; onClose: () => void}) {
  const [title, setTitle] = useState(nag?.title ?? '');
  const [note, setNote] = useState(nag?.note ?? '');
  const [activity, setActivity] = useState<Nag['activity_type']>(nag?.activity_type ?? 'personal');
  const [kind, setKind] = useState<NagSchedule['kind']>(nag?.schedule.kind ?? 'weekly');
  const [onceAt, setOnceAt] = useState(nag?.schedule.kind === 'once' ? toLocalInput(nag.schedule.at) : '');
  const [dates, setDates] = useState<string[]>(nag?.schedule.kind === 'dates' ? nag.schedule.at.map(toLocalInput) : ['']);
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set(nag?.schedule.kind === 'weekly' ? nag.schedule.weekdays : [1, 2, 3, 4, 5]));
  const [time, setTime] = useState(nag?.schedule.kind === 'weekly' ? nag.schedule.time : '09:00');
  const [dayBefore, setDayBefore] = useState(nag?.plan.dayBefore ?? '');
  const [onDay, setOnDay] = useState(nag?.plan.onDay ?? '');
  const [hoursBefore, setHoursBefore] = useState(nag?.plan.hoursBefore?.toString() ?? '');
  const [repeatOn, setRepeatOn] = useState(Boolean(nag?.plan.repeat));
  const [perHour, setPerHour] = useState(nag?.plan.repeat?.perHour.toString() ?? '2');
  const [fromH, setFromH] = useState(nag?.plan.repeat?.fromHoursBefore.toString() ?? '1');
  const [untilH, setUntilH] = useState(nag?.plan.repeat?.untilHoursAfter.toString() ?? '3');
  const [random, setRandom] = useState(nag?.plan.repeat?.random ?? false);
  const [countdown, setCountdown] = useState(nag?.countdown ?? true);
  useEffect(() => setTitle(nag?.title ?? ''), [nag?.id]);

  const schedule = (): NagSchedule | null => {
    if (kind === 'once') {
      const at = fromLocalInput(onceAt);
      return at ? {kind, at} : null;
    }
    if (kind === 'dates') {
      const at = dates.map(fromLocalInput).filter((d): d is string => d != null);
      return at.length ? {kind, at} : null;
    }
    return weekdays.size && /^\d{2}:\d{2}$/.test(time) ? {kind, weekdays: [...weekdays].sort(), time} : null;
  };
  const sched = schedule();
  const canSave = title.trim().length > 0 && sched != null;

  const save = () => {
    if (!sched) return;
    const plan: NagPlan = {};
    if (dayBefore) plan.dayBefore = dayBefore;
    if (onDay) plan.onDay = onDay;
    const hb = parseFloat(hoursBefore);
    if (hb > 0) plan.hoursBefore = hb;
    if (repeatOn) {
      plan.repeat = {
        perHour: Math.max(1, parseInt(perHour, 10) || 1),
        fromHoursBefore: Math.max(0, parseFloat(fromH) || 0),
        untilHoursAfter: Math.max(0, parseFloat(untilH) || 0),
        random,
      };
    }
    const fields = {title: title.trim(), note: note.trim() || null, activity_type: activity, schedule: sched, plan, countdown};
    if (nag) cmd('nags.update', [nag.id, fields], `Edit nag “${fields.title}”`);
    else cmd('nags.create', [fields], `New nag “${fields.title}”`);
    onClose();
  };

  return (
    <div className="inspector">
      <h2>{nag ? 'Edit nag' : 'New nag'}</h2>
      <label>
        <span>Title</span>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </label>
      <label>
        <span>Note</span>
        <input value={note} onChange={e => setNote(e.target.value)} />
      </label>
      <label>
        <span>Logged as</span>
        <select value={activity} onChange={e => setActivity(e.target.value as Nag['activity_type'])}>
          <option value="personal">Personal</option>
          <option value="work">Work</option>
        </select>
      </label>
      <div className="seg">
        {(['weekly', 'once', 'dates'] as const).map(k => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
            {k === 'weekly' ? 'Weekly' : k === 'once' ? 'Once' : 'Dates'}
          </button>
        ))}
      </div>
      {kind === 'once' && (
        <label>
          <span>When</span>
          <input type="datetime-local" value={onceAt} onChange={e => setOnceAt(e.target.value)} />
        </label>
      )}
      {kind === 'dates' && (
        <label>
          <span>Dates</span>
          {dates.map((d, i) => (
            <span key={i} className="row">
              <input type="datetime-local" value={d} onChange={e => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} />
              <button className="btn small" onClick={() => setDates(dates.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
          <button className="btn small" onClick={() => setDates([...dates, ''])}>
            + date
          </button>
        </label>
      )}
      {kind === 'weekly' && (
        <>
          <div className="weekdays">
            {WD.map((w, i) => (
              <button
                key={w}
                className={`btn small${weekdays.has(i + 1) ? ' primary' : ''}`}
                onClick={() =>
                  setWeekdays(prev => {
                    const next = new Set(prev);
                    if (next.has(i + 1)) next.delete(i + 1);
                    else next.add(i + 1);
                    return next;
                  })
                }>
                {w}
              </button>
            ))}
          </div>
          <label>
            <span>At</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </label>
        </>
      )}
      <h3>Nag plan</h3>
      <div className="row">
        <label>
          <span>Day before, at</span>
          <input type="time" value={dayBefore} onChange={e => setDayBefore(e.target.value)} />
        </label>
        <label>
          <span>On the day, at</span>
          <input type="time" value={onDay} onChange={e => setOnDay(e.target.value)} />
        </label>
        <label>
          <span>Hours before</span>
          <input type="number" min={0} step="any" value={hoursBefore} onChange={e => setHoursBefore(e.target.value)} />
        </label>
      </div>
      <div className="checks">
        <label>
          <input type="checkbox" checked={repeatOn} onChange={e => setRepeatOn(e.target.checked)} /> Repeat around the due time
        </label>
        <label>
          <input type="checkbox" checked={countdown} onChange={e => setCountdown(e.target.checked)} /> Countdown
        </label>
      </div>
      {repeatOn && (
        <div className="row">
          <label>
            <span>Per hour</span>
            <input type="number" min={1} value={perHour} onChange={e => setPerHour(e.target.value)} />
          </label>
          <label>
            <span>From h before</span>
            <input type="number" min={0} step="any" value={fromH} onChange={e => setFromH(e.target.value)} />
          </label>
          <label>
            <span>Until h after</span>
            <input type="number" min={0} step="any" value={untilH} onChange={e => setUntilH(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={random} onChange={e => setRandom(e.target.checked)} /> random slots
          </label>
        </div>
      )}
      <div className="actions">
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!canSave}>
          {nag ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}
