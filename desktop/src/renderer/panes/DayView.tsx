import {useMemo} from 'react';
import {ACTIVITY_LABEL, LEAVE_LABEL, clock, dayLabel, formatHours, hhmm, isoOn} from '../lib/format.ts';
import {
  calcDayWorkBreakdown,
  calcHourBreakdown,
  segmentWorkSecs,
} from '../../../../src/utils/hoursUtils.ts';
import {groupEntries} from '../../../../src/utils/entrySort.ts';
import type {Day} from '../../../../src/types/index.ts';
import type {DayDetail} from '../../main/queries.ts';
import type {MediaRow} from '../../../../server/src/queries.ts';
import type {PendingEntry} from '../lib/pending.ts';
import {Media} from './Media.tsx';
import {FoodCard} from './Food.tsx';
import type {FoodSelection} from './Food.tsx';
import type {DayFood} from '../../main/life.ts';

interface Props {
  date: string;
  /** undefined = loading, null = nothing pushed yet */
  detail: DayDetail | null | undefined;
  day: (Day & {pending?: boolean}) | null;
  entries: PendingEntry[];
  selectedEntryId: number | null;
  onSelectEntry: (id: number | null) => void;
  food: DayFood | null | undefined;
  selectedFoodId: number | null;
  onSelectFood: (s: FoodSelection | null) => void;
}

type LegKey = 'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2';

function TimeField({date, value, onChange}: {date: string; value: string | null; onChange: (iso: string | null) => void}) {
  return (
    <span className="timefield">
      <input type="time" value={hhmm(value)} onChange={e => onChange(e.target.value ? isoOn(date, e.target.value) : null)} />
      {value && (
        <button className="clear" title="Clear" onClick={() => onChange(null)}>
          ×
        </button>
      )}
    </span>
  );
}

function Leg({date, day, start, end, onChange}: {date: string; day: Day; start: LegKey; end: LegKey; onChange: (f: Partial<Day>) => void}) {
  const s = day[start];
  const e = day[end];
  const secs = segmentWorkSecs(s, e);
  return (
    <div className="leg">
      <TimeField date={date} value={s} onChange={v => onChange({[start]: v})} />
      <span className="arrow">→</span>
      <TimeField date={date} value={e} onChange={v => onChange({[end]: v})} />
      <span className="hours">{secs > 0 ? formatHours(secs) : '—'}</span>
    </div>
  );
}

function DayCard({date, day, entries}: {date: string; day: Day & {pending?: boolean}; entries: PendingEntry[]}) {
  const work = calcDayWorkBreakdown(day, entries);
  const split = calcHourBreakdown(entries);
  const adjustments = [
    ...(work.addedWorkSeconds > 0 ? [`+${formatHours(work.addedWorkSeconds)} after hours`] : []),
    ...(work.deductedPersonalSeconds > 0 ? [`−${formatHours(work.deductedPersonalSeconds)} personal`] : []),
  ];
  const pct = (n: number) => (split.totalTrackedSeconds ? (n / split.totalTrackedSeconds) * 100 : 0);
  const update = (fields: Partial<Day>) => {
    window.kelomit.cmd('days.update', [date, fields], `Day ${date}`).catch(() => {});
  };
  const showLeg2 = Boolean(day.started_at_2 || day.ended_at_2 || (day.started_at && day.ended_at));
  return (
    <div className={`card day-card${day.pending ? ' pending' : ''}`}>
      <Leg date={date} day={day} start="started_at" end="ended_at" onChange={update} />
      {showLeg2 && <Leg date={date} day={day} start="started_at_2" end="ended_at_2" onChange={update} />}
      {(work.hasDayLegs ? adjustments.length > 0 : work.workSeconds > 0) && (
        <div className="worked">
          <span>Worked</span>
          <span className="hours">{formatHours(work.workSeconds)}</span>
          {adjustments.length > 0 && <span className="muted">{adjustments.join('  ·  ')}</span>}
        </div>
      )}
      {split.totalTrackedSeconds > 0 && (
        <div className="split">
          <div className="bar">
            {split.workSeconds > 0 && <span className="work" style={{width: `${pct(split.workSeconds)}%`}} />}
            {split.personalWorkSeconds > 0 && (
              <span className="personal_work" style={{width: `${pct(split.personalWorkSeconds)}%`}} />
            )}
            {split.personalSeconds > 0 && (
              <span className="personal" style={{width: `${pct(split.personalSeconds)}%`}} />
            )}
          </div>
          <div className="legend">
            {split.workSeconds > 0 && <span className="work">Work {formatHours(split.workSeconds)}</span>}
            {split.personalWorkSeconds > 0 && (
              <span className="personal_work">Personal at work {formatHours(split.personalWorkSeconds)}</span>
            )}
            {split.personalSeconds > 0 && (
              <span className="personal">Personal {formatHours(split.personalSeconds)}</span>
            )}
          </div>
        </div>
      )}
      <textarea
        className="day-notes"
        placeholder="Day notes"
        defaultValue={day.notes ?? ''}
        key={day.notes ?? ''}
        onBlur={e => {
          const notes = e.target.value.trim() || null;
          if (notes !== (day.notes ?? null)) update({notes});
        }}
      />
    </div>
  );
}

function EntryRow({
  entry,
  media,
  selected,
  onSelect,
  sub,
}: {
  entry: PendingEntry;
  media: MediaRow[];
  selected: boolean;
  onSelect: () => void;
  sub?: boolean;
}) {
  const time =
    entry.time_from || entry.time_to
      ? `${clock(entry.time_from)}–${clock(entry.time_to)}`
      : entry.duration_sec
        ? formatHours(entry.duration_sec)
        : '';
  const own = media.filter(m => m.entry_id === entry.id);
  return (
    <div
      className={`entry ${entry.activity_type}${selected ? ' selected' : ''}${sub ? ' sub' : ''}${entry.pending ? ' pending' : ''}`}
      onClick={onSelect}>
      <div className="entry-head">
        <span className="title">
          {Boolean(entry.is_todo) && <span className={`todo${entry.completed_at ? ' done' : ''}`}>{entry.completed_at ? '☑' : '☐'}</span>}
          {entry.title || entry.entry_type}
        </span>
        {entry.pending && <span className="chip pending-chip">pending</span>}
        <span className="time num">{time}</span>
      </div>
      {entry.body && <p className="body">{entry.body}</p>}
      <div className="chips">
        <span className={`chip act ${entry.activity_type}`}>{ACTIVITY_LABEL[entry.activity_type]}</span>
        {Boolean(entry.is_overtime) && <span className="chip">Overtime</span>}
        {entry.project && <span className="chip">{entry.project.name}</span>}
        {(entry.tags ?? []).map(t => (
          <span key={t.id} className="chip">
            #{t.name}
          </span>
        ))}
      </div>
      <Media rows={own} />
    </div>
  );
}

export function DayView({date, detail, day, entries, selectedEntryId, onSelectEntry, food, selectedFoodId, onSelectFood}: Props) {
  const groups = useMemo(() => groupEntries(entries, 'time_asc'), [entries]);

  return (
    <div className="dayview">
      <h1>{dayLabel(date)}</h1>
      {detail === undefined ? (
        <p className="muted">…</p>
      ) : detail === null && !day ? (
        <p className="muted">No data yet — pair the phone and it will push its database here.</p>
      ) : (
        <>
          {detail && detail.leaves.length > 0 && (
            <div className="chips">
              {detail.leaves.map(l => (
                <span key={l.id} className="chip">
                  {LEAVE_LABEL[l.type] ?? l.type}
                </span>
              ))}
            </div>
          )}
          {day && day.id !== -1 ? (
            <DayCard date={date} day={day} entries={entries} />
          ) : (
            <div className="card day-card">
              <p className="muted">Nothing recorded on this day.</p>
              <button
                className="btn"
                onClick={() => window.kelomit.cmd('days.update', [date, {}], `Day ${date}`).catch(() => {})}>
                Start this day
              </button>
            </div>
          )}
          <FoodCard food={food} selectedId={selectedFoodId} onSelect={onSelectFood} />
          {groups.map(g => (
            <section key={g.key} className="group">
              {g.title && <h2>{g.title === 'tasks' ? 'Tasks' : g.title}</h2>}
              {g.items.map(({entry, subnotes}) => (
                <div key={entry.id}>
                  <EntryRow
                    entry={entry}
                    media={detail?.media ?? []}
                    selected={entry.id === selectedEntryId}
                    onSelect={() => onSelectEntry(entry.id)}
                  />
                  {subnotes.map(s => (
                    <EntryRow
                      key={s.id}
                      entry={s}
                      media={detail?.media ?? []}
                      selected={s.id === selectedEntryId}
                      onSelect={() => onSelectEntry(s.id)}
                      sub
                    />
                  ))}
                </div>
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
