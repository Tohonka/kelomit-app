import {useMemo} from 'react';
import {useQuery} from '../hooks/useQuery.ts';
import {ACTIVITY_LABEL, LEAVE_LABEL, clock, dayLabel, formatHours} from '../lib/format.ts';
import {
  calcDayWorkBreakdown,
  calcHourBreakdown,
  segmentWorkSecs,
} from '../../../../src/utils/hoursUtils.ts';
import {groupEntries} from '../../../../src/utils/entrySort.ts';
import type {Day, Entry} from '../../../../src/types/index.ts';
import type {MediaRow} from '../../../../server/src/queries.ts';

interface Props {
  date: string;
  selectedEntryId: number | null;
  onSelectEntry: (id: number | null) => void;
}

function Leg({start, end}: {start: string | null; end: string | null}) {
  if (!start && !end) return null;
  const secs = segmentWorkSecs(start, end);
  return (
    <div className="leg">
      <span className="num">
        {clock(start) || '?'} → {clock(end) || '?'}
      </span>
      <span className="hours">{secs > 0 ? formatHours(secs) : '—'}</span>
    </div>
  );
}

function DayCard({day, entries}: {day: Day; entries: Entry[]}) {
  const work = calcDayWorkBreakdown(day, entries);
  const split = calcHourBreakdown(entries);
  const adjustments = [
    ...(work.addedWorkSeconds > 0 ? [`+${formatHours(work.addedWorkSeconds)} after hours`] : []),
    ...(work.deductedPersonalSeconds > 0 ? [`−${formatHours(work.deductedPersonalSeconds)} personal`] : []),
  ];
  const hasLegs = day.started_at || day.ended_at || day.started_at_2 || day.ended_at_2;
  const pct = (n: number) => (split.totalTrackedSeconds ? (n / split.totalTrackedSeconds) * 100 : 0);
  return (
    <div className="card day-card">
      {hasLegs ? (
        <>
          <Leg start={day.started_at} end={day.ended_at} />
          <Leg start={day.started_at_2} end={day.ended_at_2} />
        </>
      ) : (
        <p className="muted">Start &amp; end not set.</p>
      )}
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
      {day.notes && <p className="day-notes">{day.notes}</p>}
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
  entry: Entry;
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
      className={`entry ${entry.activity_type}${selected ? ' selected' : ''}${sub ? ' sub' : ''}`}
      onClick={onSelect}>
      <div className="entry-head">
        <span className="title">
          {Boolean(entry.is_todo) && <span className={`todo${entry.completed_at ? ' done' : ''}`}>☐</span>}
          {entry.title || entry.entry_type}
        </span>
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
        {own.map((m, i) => (
          <span key={i} className="chip media">
            {m.media_type}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DayView({date, selectedEntryId, onSelectEntry}: Props) {
  const detail = useQuery('dayDetail', date);
  const groups = useMemo(() => groupEntries(detail?.entries ?? [], 'time_asc'), [detail]);

  return (
    <div className="dayview">
      <h1>{dayLabel(date)}</h1>
      {detail === undefined ? (
        <p className="muted">…</p>
      ) : detail === null ? (
        <p className="muted">No data yet — pair the phone and it will push its database here.</p>
      ) : (
        <>
          {detail.leaves.length > 0 && (
            <div className="chips">
              {detail.leaves.map(l => (
                <span key={l.id} className="chip">
                  {LEAVE_LABEL[l.type] ?? l.type}
                </span>
              ))}
            </div>
          )}
          {detail.day && detail.day.id >= 0 ? (
            <DayCard day={detail.day} entries={detail.entries} />
          ) : (
            !detail.leaves.length && <p className="muted">Nothing recorded on this day.</p>
          )}
          {groups.map(g => (
            <section key={g.key} className="group">
              {g.title && <h2>{g.title === 'tasks' ? 'Tasks' : g.title}</h2>}
              {g.items.map(({entry, subnotes}) => (
                <div key={entry.id}>
                  <EntryRow
                    entry={entry}
                    media={detail.media}
                    selected={entry.id === selectedEntryId}
                    onSelect={() => onSelectEntry(entry.id)}
                  />
                  {subnotes.map(s => (
                    <EntryRow
                      key={s.id}
                      entry={s}
                      media={detail.media}
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
