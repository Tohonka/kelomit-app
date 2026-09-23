import {useEffect, useState} from 'react';
import {ACTIVITY_LABEL, formatHours, hhmm, isoOn, nowOn} from '../lib/format.ts';
import {checkSubnoteSpan} from '../../../../src/utils/subnoteSpan.ts';
import type {ActivityType, Project, Tag} from '../../../../src/types/index.ts';
import type {PendingEntry} from '../lib/pending.ts';

export type Selection = {kind: 'entry'; id: number} | {kind: 'new'; parentId: number | null} | null;

interface Props {
  date: string;
  selection: Selection;
  entries: PendingEntry[];
  projects: Project[];
  tags: Tag[];
  onSelect: (s: Selection) => void;
}

type TimeMode = 'range' | 'duration';

interface Form {
  title: string;
  body: string;
  activity: ActivityType;
  projectId: number | null;
  tagNames: string[];
  timeMode: TimeMode;
  from: string;
  to: string;
  durationMin: string;
  durationStart: string;
  overtime: boolean;
  smallTask: boolean;
  todo: boolean;
}

function formFrom(e: PendingEntry | undefined, parent: PendingEntry | undefined): Form {
  const duration = e?.duration_sec != null;
  return {
    title: e?.title ?? '',
    body: e?.body ?? '',
    activity: e?.activity_type ?? parent?.activity_type ?? 'work',
    projectId: e?.project_id ?? parent?.project_id ?? null,
    tagNames: (e?.tags ?? []).map(t => t.name),
    timeMode: duration ? 'duration' : 'range',
    from: e && !duration ? hhmm(e.time_from) : parent ? hhmm(parent.time_from) : '',
    to: e && !duration ? hhmm(e.time_to) : '',
    durationMin: duration ? String(Math.round((e!.duration_sec ?? 0) / 60)) : '',
    durationStart: duration ? hhmm(e!.time_from) : '',
    overtime: Boolean(e?.is_overtime),
    smallTask: Boolean(e?.is_small_task),
    todo: Boolean(e?.is_todo),
  };
}

/** The phone editor's save rules, on the desktop: every note gets a real
 *  from→to; a duration note starts at its picked start or "now" on that day. */
function resolveTimes(f: Form, date: string): {from: string | null; to: string | null; durationSec: number | null} {
  if (f.timeMode === 'range') {
    const from = f.from ? isoOn(date, f.from) : null;
    let to = f.to ? isoOn(date, f.to) : null;
    if (from && to && to < from) {
      to = new Date(new Date(to).getTime() + 86_400_000).toISOString();
    }
    return {from, to, durationSec: null};
  }
  const minutes = Number(f.durationMin);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return {from: null, to: null, durationSec: null};
  }
  const durationSec = Math.round(minutes * 60);
  const from = (f.durationStart && isoOn(date, f.durationStart)) || nowOn(date);
  const to = new Date(new Date(from).getTime() + durationSec * 1000).toISOString();
  return {from, to, durationSec};
}

export function Inspector({date, selection, entries, projects, tags, onSelect}: Props) {
  const entry = selection?.kind === 'entry' ? entries.find(e => e.id === selection.id) : undefined;
  const parentId = selection?.kind === 'new' ? selection.parentId : (entry?.parent_id ?? null);
  const parent = parentId != null ? entries.find(e => e.id === parentId) : undefined;
  const isNew = selection?.kind === 'new';
  const [form, setForm] = useState<Form>(() => formFrom(entry, parent));
  const [tagInput, setTagInput] = useState('');
  const key = selection ? `${selection.kind}:${'id' in selection ? selection.id : selection.parentId}:${entry?.updated_at ?? ''}` : '';

  // Reset the form when the selection (or the row behind it) changes.
  useEffect(() => {
    setForm(formFrom(entry, parent));
    setTagInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!selection) {
    return <div className="empty">Select an entry, or ⌘N for a new note</div>;
  }
  if (selection.kind === 'entry' && !entry) {
    return <div className="empty">Entry gone</div>;
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({...f, [k]: v}));
  const label = (verb: string) => `${verb} note${form.title ? ` “${form.title}”` : ''}`;

  const save = async () => {
    const {from, to, durationSec} = resolveTimes(form, date);
    if (parent) {
      const check = checkSubnoteSpan(parent, from, to, durationSec);
      if (check.tooLong != null) {
        alert(`A subnote can't be longer than its parent (${formatHours(check.tooLong)}).`);
        return;
      }
      if (check.moveParentFrom && !confirm(`Move the parent to start at ${hhmm(check.moveParentFrom)}?`)) return;
      if (check.moveParentTo && !confirm(`Move the parent to end at ${hhmm(check.moveParentTo)}?`)) return;
      if ((check.moveParentFrom || check.moveParentTo) && parent.id > 0) {
        await window.kelomit.cmd(
          'entries.update',
          [parent.id, {...(check.moveParentFrom ? {time_from: check.moveParentFrom} : {}), ...(check.moveParentTo ? {time_to: check.moveParentTo} : {})}],
          `Move parent “${parent.title ?? ''}”`,
        );
      }
    }
    const fields = {
      title: form.title.trim() || null,
      body: form.body.trim() || null,
      activity_type: form.activity,
      project_id: parent ? parent.project_id : form.projectId,
      is_overtime: form.activity === 'work' && form.overtime,
      is_small_task: form.timeMode === 'duration' && durationSec != null && form.smallTask,
      duration_sec: durationSec,
      time_from: from,
      time_to: to,
      tagNames: form.tagNames,
    };
    if (isNew) {
      await window.kelomit.cmd(
        'entries.create',
        [date, {entry_type: 'note', ...fields, parent_id: parentId, is_todo: form.todo && !parent, scheduled_date: form.todo && !parent ? date : null}],
        label('New'),
      );
      onSelect(null);
    } else if (entry!.queueId) {
      await window.kelomit.queueUpdate(entry!.queueId, [date, {entry_type: 'note', ...fields, parent_id: entry!.parent_id, is_todo: entry!.is_todo, scheduled_date: entry!.is_todo ? date : null}], label('New'));
    } else {
      await window.kelomit.cmd('entries.update', [entry!.id, fields], label('Edit'));
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!confirm(`Delete ${entry.title ? `“${entry.title}”` : 'this note'}?`)) return;
    if (entry.queueId) {
      await window.kelomit.queueRemove(entry.queueId);
    } else {
      await window.kelomit.cmd('entries.delete', [entry.id], label('Delete'));
    }
    onSelect(null);
  };

  const toggleTodo = async () => {
    if (!entry || entry.id < 0) return;
    await window.kelomit.cmd('entries.setTodoDone', [entry.id, !entry.completed_at], `${entry.completed_at ? 'Reopen' : 'Complete'} to-do`);
  };

  const addTag = (name: string) => {
    const clean = name.trim().replace(/^#/, '');
    if (clean && !form.tagNames.includes(clean)) set('tagNames', [...form.tagNames, clean]);
    setTagInput('');
  };

  return (
    <div className="inspector">
      <h2>
        {isNew ? (parent ? `New subnote of “${parent.title ?? ''}”` : 'New note') : entry?.pending ? 'Pending note' : 'Edit note'}
      </h2>
      <label>
        <span>Title</span>
        <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
      </label>
      <label>
        <span>Text</span>
        <textarea rows={4} value={form.body} onChange={e => set('body', e.target.value)} />
      </label>
      <label>
        <span>Activity</span>
        <select value={form.activity} onChange={e => set('activity', e.target.value as ActivityType)}>
          {(['work', 'personal_work', 'personal'] as ActivityType[]).map(a => (
            <option key={a} value={a}>
              {ACTIVITY_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
      {!parent && (
        <label>
          <span>Project</span>
          <select value={form.projectId ?? ''} onChange={e => set('projectId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {projects
              .filter(p => !p.archived || p.id === form.projectId)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        <span>Tags</span>
        <div className="tags">
          {form.tagNames.map(t => (
            <button key={t} className="chip" onClick={() => set('tagNames', form.tagNames.filter(x => x !== t))} title="Remove">
              #{t} ×
            </button>
          ))}
          <input
            list="tag-options"
            placeholder="add tag"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
          />
          <datalist id="tag-options">
            {tags.map(t => (
              <option key={t.id} value={t.name} />
            ))}
          </datalist>
        </div>
      </label>
      <div className="seg">
        <button className={form.timeMode === 'range' ? 'on' : ''} onClick={() => set('timeMode', 'range')}>
          From – to
        </button>
        <button className={form.timeMode === 'duration' ? 'on' : ''} onClick={() => set('timeMode', 'duration')}>
          Duration
        </button>
      </div>
      {form.timeMode === 'range' ? (
        <div className="row">
          <label>
            <span>From</span>
            <input type="time" value={form.from} onChange={e => set('from', e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="time" value={form.to} onChange={e => set('to', e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="row">
          <label>
            <span>Minutes</span>
            <input type="number" min={1} value={form.durationMin} onChange={e => set('durationMin', e.target.value)} />
          </label>
          <label>
            <span>Start (optional)</span>
            <input type="time" value={form.durationStart} onChange={e => set('durationStart', e.target.value)} />
          </label>
        </div>
      )}
      <div className="checks">
        {form.activity === 'work' && (
          <label>
            <input type="checkbox" checked={form.overtime} onChange={e => set('overtime', e.target.checked)} /> Overtime
          </label>
        )}
        {form.timeMode === 'duration' && (
          <label>
            <input type="checkbox" checked={form.smallTask} onChange={e => set('smallTask', e.target.checked)} /> Small task
          </label>
        )}
        {isNew && !parent && (
          <label>
            <input type="checkbox" checked={form.todo} onChange={e => set('todo', e.target.checked)} /> To-do
          </label>
        )}
      </div>
      <div className="actions">
        {entry && !isNew && (
          <>
            <button className="btn danger" onClick={remove}>
              Delete
            </button>
            {entry.is_todo && entry.id > 0 && (
              <button className="btn" onClick={toggleTodo}>
                {entry.completed_at ? 'Reopen' : 'Mark done'}
              </button>
            )}
            {entry.id > 0 && !entry.parent_id && (
              <button className="btn" onClick={() => onSelect({kind: 'new', parentId: entry.id})}>
                Add subnote
              </button>
            )}
          </>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => onSelect(null)}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          {isNew ? 'Add' : 'Save'}
        </button>
      </div>
    </div>
  );
}
