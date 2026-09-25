import {useEffect, useState} from 'react';
import {ACTIVITY_LABEL, clock, dayLabel} from '../lib/format.ts';
import type {SearchHit} from '../../main/life.ts';

/** Title / body / project / tag search over the pushed database; a hit opens
 *  its note on the day. Same SQL as the phone's Search tab. */
export function Search({onOpen}: {onOpen: (date: string, entryId: number) => void}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      window.kelomit
        .query('search', query)
        .then(r => live && setHits(r ?? []))
        .catch(() => {});
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="search">
      <input autoFocus placeholder="Search notes, projects, tags…" value={q} onChange={e => setQ(e.target.value)} />
      {hits && <p className="muted">{hits.length === 0 ? `Nothing matches “${q.trim()}”.` : `${hits.length} result${hits.length === 1 ? '' : 's'}`}</p>}
      {hits?.map(({entry, date}) => (
        <div key={entry.id} className={`entry ${entry.activity_type}`} onClick={() => onOpen(date, entry.id)}>
          <div className="entry-head">
            <span className="title">{entry.title || entry.entry_type}</span>
            <span className="time num">
              {dayLabel(date)} · {clock(entry.time_from ?? entry.created_at)}
            </span>
          </div>
          {entry.body && <p className="body">{entry.body.length > 240 ? `${entry.body.slice(0, 240)}…` : entry.body}</p>}
          <div className="chips">
            <span className={`chip act ${entry.activity_type}`}>{ACTIVITY_LABEL[entry.activity_type]}</span>
            {entry.project && <span className="chip">{entry.project.name}</span>}
            {(entry.tags ?? []).map(t => (
              <span key={t.id} className="chip">
                #{t.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
