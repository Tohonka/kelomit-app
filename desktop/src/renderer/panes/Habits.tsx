import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '../hooks/useQuery.ts';
import {addMonths, monthLabel} from '../lib/format.ts';
import {monthRange} from '../../../../src/utils/habitMonth.ts';
import {isLifeKind} from '../../../../src/utils/habitMatch.ts';
import type {Habit, HabitCategory, HabitGoalKind, HabitMatcher, HabitMatcherKind, Project, Tag} from '../../../../src/types/index.ts';
import type {HabitsMonth} from '../../main/life.ts';
import type {QueueItem} from '../../main/queue.ts';

const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});

type Overrides = Record<number, Record<string, boolean>>;

/** Pending `habits.setOverride` commands laid over the mirror's overrides, so
 *  a click shows at once instead of after the phone's push. */
function overlay(base: Overrides, queue: QueueItem[]): Overrides {
  const out: Overrides = {};
  for (const [h, dates] of Object.entries(base)) out[Number(h)] = {...dates};
  for (const item of queue) {
    if (item.fn !== 'habits.setOverride') continue;
    const [h, d, v] = item.args as [number, string, boolean | null];
    if (v == null) delete out[h]?.[d];
    else (out[h] ??= {})[d] = v;
  }
  return out;
}

const LIFE: {kind: HabitMatcherKind; label: string; hint: string}[] = [
  {kind: 'steps', label: 'Steps ≥', hint: '8000'},
  {kind: 'sleep_minutes', label: 'Sleep minutes ≥', hint: '420'},
  {kind: 'food_entries', label: 'Food entries ≥', hint: '1'},
  {kind: 'food_kcal', label: 'Food kcal ≤', hint: '2200'},
];

type Edit = {kind: 'category'; id: number | null} | {kind: 'habit'; id: number | null; categoryId: number} | null;

interface Props {
  month: string;
  onMonth: (m: string) => void;
  projects: Project[];
  tags: Tag[];
  queue: QueueItem[];
}

export function Habits({month, onMonth, projects, tags, queue}: Props) {
  const data = useQuery('habitsMonth', month);
  const [edit, setEdit] = useState<Edit>(null);
  const [showArchived, setShowArchived] = useState(false);
  const overrides = useMemo(() => overlay(data?.overrides ?? {}, queue), [data, queue]);
  const {from, to} = monthRange(month);
  const dates = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= Number(to.slice(-2)); d++) out.push(`${month}-${String(d).padStart(2, '0')}`);
    return out;
  }, [month, to]);

  if (data === undefined) return <div className="empty">…</div>;
  if (data === null) return <div className="empty">No data yet — pair the phone.</div>;

  const today = data.today;
  const effective = (h: number, d: string) => overrides[h]?.[d] ?? data.auto[h]?.[d]?.done ?? false;
  const toggle = (habit: Habit, d: string) => {
    if (d > today) return;
    const auto = data.auto[habit.id]?.[d]?.done ?? false;
    const next = !effective(habit.id, d);
    // habitStore.toggleDay: landing back on the auto value drops the override.
    const value = next === auto ? null : next;
    cmd('habits.setOverride', [habit.id, d, value], `${next ? 'Done' : 'Undone'} “${habit.title}” ${d}`);
  };
  const clear = (habit: Habit, d: string) => {
    if (overrides[habit.id]?.[d] === undefined) return;
    cmd('habits.setOverride', [habit.id, d, null], `Auto “${habit.title}” ${d}`);
  };

  const categories = data.categories.filter(c => showArchived || !c.archived);

  return (
    <div className="habits">
      <div className="matrix">
        <div className="month-nav">
          <button className="btn" onClick={() => onMonth(addMonths(month, -1))}>
            ‹
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="btn" onClick={() => onMonth(addMonths(month, 1))}>
            ›
          </button>
          <span className="spacer" />
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> archived
          </label>
          <button className="btn" onClick={() => setEdit({kind: 'category', id: null})}>
            + Category
          </button>
        </div>
        {categories.length === 0 && <p className="muted">No habit categories yet.</p>}
        {categories.map(c => {
          const habits = data.habits.filter(h => h.category_id === c.id && (showArchived || !h.archived));
          const streak = data.streaks[c.id] ?? 0;
          return (
            <section key={c.id} className={`cat${c.archived ? ' archived' : ''}`}>
              <header>
                <strong>{c.title}</strong>
                {c.description && <span className="muted">{c.description}</span>}
                <span className={`streak${streak > 0 ? ' on' : ''}`}>
                  {streak > 0 ? '🔥 ' : ''}
                  {streak}d{c.goal_streak_days ? ` / ${c.goal_streak_days}` : ''}
                </span>
                <span className="spacer" />
                <button className="btn small" onClick={() => setEdit({kind: 'habit', id: null, categoryId: c.id})}>
                  + Habit
                </button>
                <button className="btn small" onClick={() => setEdit({kind: 'category', id: c.id})}>
                  Edit
                </button>
                <button
                  className="btn small"
                  onClick={() => cmd('habitCategories.archive', [c.id, !c.archived], `${c.archived ? 'Unarchive' : 'Archive'} “${c.title}”`)}>
                  {c.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  className="btn small danger"
                  onClick={() => confirm(`Delete category “${c.title}” and its habits?`) && cmd('habitCategories.delete', [c.id], `Delete category “${c.title}”`)}>
                  Delete
                </button>
              </header>
              <div className="rows" style={{gridTemplateColumns: `200px repeat(${dates.length}, 1fr)`}}>
                <span />
                {dates.map(d => (
                  <span key={d} className={`dn${d === today ? ' today' : ''}`}>
                    {Number(d.slice(-2))}
                  </span>
                ))}
                {habits.map(h => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    dates={dates}
                    today={today}
                    data={data}
                    overrides={overrides}
                    effective={effective}
                    onToggle={toggle}
                    onClear={clear}
                    onEdit={() => setEdit({kind: 'habit', id: h.id, categoryId: c.id})}
                  />
                ))}
                {habits.length === 0 && <span className="muted" style={{gridColumn: '1 / -1'}}>No habits.</span>}
              </div>
            </section>
          );
        })}
        <p className="muted hint">
          Click a day to toggle; ⌥-click puts it back to automatic. Dots with a ring are manual; the range {from} – {to}.
        </p>
      </div>
      {edit && (
        <aside className="pane editor">
          {edit.kind === 'category' ? (
            <CategoryForm category={data.categories.find(c => c.id === edit.id) ?? null} onClose={() => setEdit(null)} />
          ) : (
            <HabitForm
              habit={data.habits.find(h => h.id === edit.id) ?? null}
              categoryId={edit.categoryId}
              matchers={data.matchers.filter(m => m.habit_id === edit.id)}
              projects={projects}
              tags={tags}
              triggers={data.triggers}
              onClose={() => setEdit(null)}
            />
          )}
        </aside>
      )}
    </div>
  );
}

function HabitRow({
  habit,
  dates,
  today,
  data,
  overrides,
  effective,
  onToggle,
  onClear,
  onEdit,
}: {
  habit: Habit;
  dates: string[];
  today: string;
  data: HabitsMonth;
  overrides: Overrides;
  effective: (h: number, d: string) => boolean;
  onToggle: (h: Habit, d: string) => void;
  onClear: (h: Habit, d: string) => void;
  onEdit: () => void;
}) {
  const goal =
    habit.goal_kind === 'minutes' ? `${habit.goal_value} min` : habit.goal_kind === 'count' ? `${habit.goal_value}×` : '';
  return (
    <>
      <span className={`hname${habit.archived ? ' archived' : ''}`} onClick={onEdit} title="Edit habit">
        <i style={{background: habit.color ?? 'var(--primary)'}} />
        {habit.title}
        {goal && <span className="muted"> {goal}</span>}
      </span>
      {dates.map(d => {
        const done = effective(habit.id, d);
        const manual = overrides[habit.id]?.[d] !== undefined;
        const p = data.auto[habit.id]?.[d];
        const title = p ? `${p.count} hit${p.count === 1 ? '' : 's'}${p.seconds ? `, ${Math.round(p.seconds / 60)} min` : ''}` : '';
        return (
          <button
            key={d}
            className={`dot${done ? ' done' : ''}${manual ? ' manual' : ''}${d > today ? ' future' : ''}${d === today ? ' today' : ''}`}
            style={done ? {background: habit.color ?? 'var(--primary)'} : undefined}
            title={title}
            disabled={d > today}
            onClick={e => (e.altKey ? onClear(habit, d) : onToggle(habit, d))}
          />
        );
      })}
    </>
  );
}

function CategoryForm({category, onClose}: {category: HabitCategory | null; onClose: () => void}) {
  const [title, setTitle] = useState(category?.title ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'star-outline');
  const [streak, setStreak] = useState(category?.goal_streak_days?.toString() ?? '');
  const save = () => {
    const n = parseInt(streak, 10);
    const fields = {title: title.trim(), description: description.trim() || null, icon: icon.trim() || 'star-outline', goal_streak_days: n > 0 ? n : null};
    if (!fields.title) return;
    if (category) cmd('habitCategories.update', [category.id, fields], `Edit category “${fields.title}”`);
    else cmd('habitCategories.create', [fields], `New category “${fields.title}”`);
    onClose();
  };
  return (
    <div className="inspector">
      <h2>{category ? 'Edit category' : 'New category'}</h2>
      <label>
        <span>Title</span>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </label>
      <label>
        <span>Description</span>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <div className="row">
        <label>
          <span>Icon (Material name)</span>
          <input value={icon} onChange={e => setIcon(e.target.value)} />
        </label>
        <label>
          <span>Streak goal, days</span>
          <input type="number" min={1} value={streak} onChange={e => setStreak(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!title.trim()}>
          {category ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}

const mkey = (kind: string, id: number) => `${kind}:${id}`;

function HabitForm({
  habit,
  categoryId,
  matchers,
  projects,
  tags,
  triggers,
  onClose,
}: {
  habit: Habit | null;
  categoryId: number;
  matchers: HabitMatcher[];
  projects: Project[];
  tags: Tag[];
  triggers: {id: number; name: string}[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(habit?.title ?? '');
  const [description, setDescription] = useState(habit?.description ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? 'circle-outline');
  const [color, setColor] = useState<string | null>(habit?.color ?? null);
  const [goalKind, setGoalKind] = useState<HabitGoalKind | ''>(habit?.goal_kind ?? '');
  const [goalValue, setGoalValue] = useState(habit?.goal_value?.toString() ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(matchers.map(m => mkey(m.kind, m.ref_id))));
  const [thresholds, setThresholds] = useState<Record<string, string>>(() =>
    Object.fromEntries(matchers.filter(m => isLifeKind(m.kind) && m.threshold != null).map(m => [mkey(m.kind, m.ref_id), String(m.threshold)])),
  );
  const [filter, setFilter] = useState('');
  useEffect(() => setFilter(''), [habit?.id]);

  const flip = (k: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const goal = parseInt(goalValue, 10);
  const canSave = title.trim().length > 0 && (goalKind === '' || goal > 0);
  const save = () => {
    const fields = {
      title: title.trim(),
      description: description.trim() || null,
      icon: icon.trim() || 'circle-outline',
      color,
      goal_kind: goalKind === '' ? null : goalKind,
      goal_value: goalKind === '' ? null : goal,
    };
    const list = [...selected].map(k => {
      const [kind, ref] = k.split(':');
      const n = parseFloat((thresholds[k] ?? '').replace(',', '.'));
      return {
        kind: kind as HabitMatcherKind,
        ref_id: Number(ref),
        threshold: isLifeKind(kind as HabitMatcherKind) && Number.isFinite(n) && n > 0 ? n : null,
      };
    });
    if (habit) cmd('habits.update', [habit.id, fields, list], `Edit habit “${fields.title}”`);
    else cmd('habits.create', [{...fields, category_id: categoryId}, list], `New habit “${fields.title}”`);
    onClose();
  };

  const q = filter.trim().toLowerCase();
  const show = (name: string, k: string) => !q || name.toLowerCase().includes(q) || selected.has(k);

  return (
    <div className="inspector">
      <h2>{habit ? 'Edit habit' : 'New habit'}</h2>
      <label>
        <span>Title</span>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </label>
      <label>
        <span>Description</span>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <div className="row">
        <label>
          <span>Icon (Material name)</span>
          <input value={icon} onChange={e => setIcon(e.target.value)} />
        </label>
        <label>
          <span>Colour</span>
          <span className="row">
            <input type="color" value={color ?? '#8b5cf6'} onChange={e => setColor(e.target.value)} />
            {color && (
              <button className="btn small" onClick={() => setColor(null)}>
                theme
              </button>
            )}
          </span>
        </label>
      </div>
      <div className="row">
        <label>
          <span>Goal</span>
          <select value={goalKind} onChange={e => setGoalKind(e.target.value as HabitGoalKind | '')}>
            <option value="">at least once</option>
            <option value="minutes">minutes per day</option>
            <option value="count">times per day</option>
          </select>
        </label>
        {goalKind !== '' && (
          <label>
            <span>{goalKind === 'minutes' ? 'Minutes' : 'Times'}</span>
            <input type="number" min={1} value={goalValue} onChange={e => setGoalValue(e.target.value)} />
          </label>
        )}
      </div>
      <label>
        <span>Counts when a note has… (any of)</span>
        <input placeholder="filter" value={filter} onChange={e => setFilter(e.target.value)} />
      </label>
      <div className="matchers">
        {projects.filter(p => !p.archived).map(p => {
          const k = mkey('project', p.id);
          return show(p.name, k) ? (
            <label key={k}>
              <input type="checkbox" checked={selected.has(k)} onChange={() => flip(k)} /> project {p.name}
            </label>
          ) : null;
        })}
        {tags.map(t => {
          const k = mkey('tag', t.id);
          return show(t.name, k) ? (
            <label key={k}>
              <input type="checkbox" checked={selected.has(k)} onChange={() => flip(k)} /> #{t.name}
            </label>
          ) : null;
        })}
        {triggers.map(t => {
          const k = mkey('trigger', t.id);
          return show(t.name, k) ? (
            <label key={k}>
              <input type="checkbox" checked={selected.has(k)} onChange={() => flip(k)} /> trigger {t.name}
            </label>
          ) : null;
        })}
      </div>
      <span className="muted small">…or the day itself</span>
      <div className="matchers">
        {LIFE.map(l => {
          const k = mkey(l.kind, 0);
          return (
            <label key={k} className="life">
              <input type="checkbox" checked={selected.has(k)} onChange={() => flip(k)} /> {l.label}
              {selected.has(k) && (
                <input
                  type="number"
                  min={1}
                  placeholder={l.hint}
                  value={thresholds[k] ?? ''}
                  onChange={e => setThresholds({...thresholds, [k]: e.target.value})}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="actions">
        {habit && (
          <>
            <button
              className="btn danger"
              onClick={() => confirm(`Delete habit “${habit.title}”?`) && (cmd('habits.delete', [habit.id], `Delete habit “${habit.title}”`), onClose())}>
              Delete
            </button>
            <button
              className="btn"
              onClick={() => (cmd('habits.archive', [habit.id, !habit.archived], `${habit.archived ? 'Unarchive' : 'Archive'} habit “${habit.title}”`), onClose())}>
              {habit.archived ? 'Unarchive' : 'Archive'}
            </button>
          </>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!canSave}>
          {habit ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}
