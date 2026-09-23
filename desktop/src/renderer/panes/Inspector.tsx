import {useQuery} from '../hooks/useQuery.ts';
import {ACTIVITY_LABEL, clock, formatHours} from '../lib/format.ts';

interface Props {
  date: string;
  entryId: number | null;
}

/** Read-only detail of the selected entry. Becomes the editor in T6. */
export function Inspector({date, entryId}: Props) {
  const detail = useQuery('dayDetail', date);
  const entry = detail?.entries.find(e => e.id === entryId);
  if (!entry) {
    return <div className="empty">Select an entry</div>;
  }
  const rows: [string, string][] = [
    ['Type', entry.entry_type],
    ['Activity', ACTIVITY_LABEL[entry.activity_type]],
    ['Project', entry.project?.name ?? '—'],
    ['Tags', (entry.tags ?? []).map(t => `#${t.name}`).join(' ') || '—'],
    ['From', clock(entry.time_from) || '—'],
    ['To', clock(entry.time_to) || '—'],
    ['Duration', entry.duration_sec ? formatHours(entry.duration_sec) : '—'],
    ['Overtime', entry.is_overtime ? 'yes' : 'no'],
    ['Small task', entry.is_small_task ? 'yes' : 'no'],
    ['To-do', entry.is_todo ? (entry.completed_at ? 'done' : 'open') : 'no'],
    ['Location', entry.location_label ?? '—'],
    ['Created', new Date(entry.created_at).toLocaleString()],
  ];
  return (
    <div className="inspector">
      <h2>{entry.title || entry.entry_type}</h2>
      {entry.body && <p className="body">{entry.body}</p>}
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
