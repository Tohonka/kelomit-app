import {useQuery} from '../hooks/useQuery.ts';
import {addMonths, clock, dayLabel, monthLabel} from '../lib/format.ts';
import {mediaUrl} from './Media.tsx';

interface Props {
  month: string;
  onMonth: (m: string) => void;
  onOpen: (date: string, entryId: number) => void;
}

/** The month's photos and videos, newest first; a tile opens its note on the day. */
export function Gallery({month, onMonth, onOpen}: Props) {
  const items = useQuery('gallery', month);
  const byDate = new Map<string, NonNullable<typeof items>>();
  for (const it of items ?? []) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);

  return (
    <div className="gallery">
      <div className="month-nav">
        <button className="btn" onClick={() => onMonth(addMonths(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn" onClick={() => onMonth(addMonths(month, 1))}>
          ›
        </button>
        <span className="spacer" />
        <span className="muted">{items ? `${items.length} item${items.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      {items && items.length === 0 && <p className="muted">No photos or videos this month.</p>}
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date}>
          <h2>{dayLabel(date)}</h2>
          <div className="shots">
            {list.map((it, i) => {
              const src = mediaUrl(it.thumbnail_path ?? (it.media_type === 'photo' ? it.file_path : null));
              return (
                <figure key={`${it.entry_id}-${i}`} onClick={() => onOpen(date, it.entry_id)} title={it.title ?? ''}>
                  {src ? <img src={src} alt="" /> : <div className="video-tile">▶</div>}
                  {it.media_type === 'video' && <span className="badge">▶</span>}
                  <figcaption>
                    {clock(it.created_at)}
                    {it.title ? ` · ${it.title}` : ''}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
