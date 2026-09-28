import {useEffect, useState} from 'react';
import type {DayAppUse, AppUseApp, AppUseChunk} from '../../main/appUse/read.ts';
import type {CollectorStatus} from '../../main/appUse/collector.ts';
import type {PendingEntry} from '../lib/pending.ts';
import {formatHours} from '../lib/format.ts';

/*
 * The day's app use: which apps were in front on the Mac, for how long,
 * how much of that was idling, and which note each chunk is pinned to.
 * Assignments are whole minutes taken from the day's bucket; the note
 * carries the from–to. Everything goes to the phone as commands.
 */
const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;
const fmt = (s: number) => (s >= 3600 ? formatHours(s) : mins(s));

function useDayAppUse(date: string): DayAppUse | null | undefined {
  const [data, setData] = useState<DayAppUse | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setData(undefined);
    const load = () => {
      window.kelomit
        .query('dayAppUse', date)
        .then(d => {
          if (live) setData(d);
        })
        .catch(() => {});
    };
    load();
    const offDb = window.kelomit.onDbChanged(load);
    const offLive = window.kelomit.onAppUseChanged(load);
    return () => {
      live = false;
      offDb();
      offLive();
    };
  }, [date]);
  return data;
}

function StatusLine() {
  const [s, setS] = useState<CollectorStatus | null>(null);
  useEffect(() => {
    const load = () =>
      window.kelomit
        .appUseStatus()
        .then(setS)
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  const what =
    s.state === 'off'
      ? 'not tracking'
      : s.state === 'away'
      ? 'away (screen locked or screensaver)'
      : `${s.front?.name ?? '?'} · ${s.state}${s.sessionFrom ? ' · under the running timer' : ''}`;
  return <p className="muted note">Now: {what}</p>;
}

function Chip({chunk, app}: {chunk: AppUseChunk; app: AppUseApp}) {
  const label = chunk.entry_id == null ? 'timer running' : chunk.title || 'Untitled note';
  const canDrop = chunk.id > 0;
  const drop = () => {
    const fn = chunk.kind === 'manual' ? 'appUse.removeAssignment' : 'appUse.detach';
    window.kelomit.cmd(fn, [chunk.id], `${app.app_name}: unassign ${mins(chunk.seconds)}`).catch(() => {});
  };
  return (
    <span className="chip">
      {label} · {mins(chunk.seconds)}
      {canDrop && (
        <button className="x" title={chunk.kind === 'manual' ? 'Remove' : 'Detach from the note'} onClick={drop}>
          ×
        </button>
      )}
    </span>
  );
}

function AssignForm({date, app, notes, onDone}: {date: string; app: AppUseApp; notes: PendingEntry[]; onDone: () => void}) {
  const max = Math.floor(app.unassigned_sec / 60);
  const [entryId, setEntryId] = useState<number>(notes[0]?.id ?? 0);
  const [minutes, setMinutes] = useState<number>(max);
  if (notes.length === 0) return <p className="muted note">No notes on this day to assign to.</p>;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (max < 1 || notes.length === 0) {
      onDone();
      return;
    }
    const m = Math.min(max, Math.max(1, Math.round(minutes)));
    const note = notes.find(n => n.id === entryId) ?? notes[0];
    window.kelomit
      .cmd('appUse.assign', [date, app.bundle_id, note.id, m * 60], `${app.app_name}: ${m} min → ${note.title || 'note'}`)
      .catch(() => {});
    onDone();
  };
  return (
    <form className="row assign" onSubmit={submit}>
      <select value={entryId} onChange={e => setEntryId(Number(e.target.value))}>
        {notes.map(n => (
          <option key={n.id} value={n.id}>
            {n.title || `Note ${n.time_from?.slice(11, 16) ?? n.id}`}
          </option>
        ))}
      </select>
      <input type="number" min={1} max={max} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
      <span className="muted">min of {max}</span>
      <button className="btn primary" type="submit">
        Assign
      </button>
      <button className="btn" type="button" onClick={onDone}>
        Cancel
      </button>
    </form>
  );
}

function AppRow({
  date,
  app,
  notes,
  open,
  onToggle,
}: {
  date: string;
  app: AppUseApp;
  notes: PendingEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  const total = app.active_sec + app.idle_sec;
  const assignedPct = Math.round((100 * (total - app.unassigned_sec)) / Math.max(1, total));
  return (
    <div className="break">
      <div className="top">
        <span className="lbl">{app.app_name}</span>
        <span className="muted num">
          {fmt(total)}
          {app.idle_sec > 0 && ` · idling ${fmt(app.idle_sec)}`}
        </span>
      </div>
      <div className="track" title={`${assignedPct}% assigned to notes`}>
        <div className="fill" style={{width: `${assignedPct}%`, background: 'var(--primary)'}} />
      </div>
      <div className="chips">
        {app.chunks.map((c, i) => (
          <Chip key={c.id > 0 ? `${c.kind}-${c.id}` : `live-${i}`} chunk={c} app={app} />
        ))}
        {app.unassigned_sec >= 60 && (
          <button className="btn" onClick={onToggle}>
            Assign {mins(app.unassigned_sec)}…
          </button>
        )}
      </div>
      {open && <AssignForm date={date} app={app} notes={notes} onDone={onToggle} />}
    </div>
  );
}

export function AppUseCard({date, entries}: {date: string; entries: PendingEntry[]}) {
  const data = useDayAppUse(date);
  const [assigning, setAssigning] = useState<string | null>(null);
  // Top-level, already-on-the-phone notes only (a pending create has no id yet).
  const notes = entries.filter(e => e.parent_id == null && !e.pending);
  if (data === undefined) return <p className="muted">…</p>;
  return (
    <div className="card app-use">
      <StatusLine />
      {!data || data.apps.length === 0 ? (
        <p className="muted">No app use recorded on this day.</p>
      ) : (
        <>
          <p className="muted">
            {formatHours(data.total_sec)} in apps
            {data.idle_sec > 0 && ` · idling ${fmt(data.idle_sec)} of that`}
          </p>
          {data.apps.map(a => (
            <AppRow
              key={a.bundle_id}
              date={date}
              app={a}
              notes={notes}
              open={assigning === a.bundle_id}
              onToggle={() => setAssigning(assigning === a.bundle_id ? null : a.bundle_id)}
            />
          ))}
        </>
      )}
    </div>
  );
}
