import {useState} from 'react';
import type {MediaRow} from '../../../../server/src/queries.ts';
import {formatHours} from '../lib/format.ts';

/** Media paths in the DB are absolute Android paths; the desktop stores files
 *  by basename under media/, served through the kelomit-media:// protocol. */
export function mediaUrl(filePath: string | null | undefined): string | null {
  const name = filePath?.split('/').pop();
  return name ? `kelomit-media:///${encodeURIComponent(name)}` : null;
}

/** Photos as a thumbnail grid (click → lightbox), voice with transcript, video
 *  inline. With `onDelete` every item gets a remove button (the inspector). */
export function Media({rows, onDelete}: {rows: MediaRow[]; onDelete?: (m: MediaRow) => void}) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const photos = rows.filter(m => m.media_type === 'photo');
  const rest = rows.filter(m => m.media_type !== 'photo');
  const del = (m: MediaRow) =>
    onDelete && (
      <button className="btn small danger del" title="Remove from the note" onClick={() => onDelete(m)}>
        ×
      </button>
    );
  return (
    <div className="media" onClick={e => e.stopPropagation()}>
      {photos.length > 0 && (
        <div className="shots">
          {photos.map((m, i) => {
            const full = mediaUrl(m.file_path);
            const thumb = mediaUrl(m.thumbnail_path) ?? full;
            return thumb ? (
              <figure key={i}>
                <img src={thumb} alt="" loading="lazy" onClick={() => full && setOpen(full)} />
                {del(m)}
              </figure>
            ) : null;
          })}
        </div>
      )}
      {rest.map((m, i) => {
        const src = mediaUrl(m.file_path);
        if (!src) return null;
        if (m.media_type === 'voice') {
          return (
            <div key={i} className="voice">
              <audio controls preload="none" src={src} />
              {m.duration_sec != null && <span className="muted">{formatHours(m.duration_sec) || `${m.duration_sec}s`}</span>}
              {del(m)}
              {m.transcript && <p className="transcript">{m.transcript}</p>}
            </div>
          );
        }
        return (
          <div key={i} className="clip">
            <video controls preload="metadata" src={src} />
            {del(m)}
          </div>
        );
      })}
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={open} alt="" />
        </div>
      )}
    </div>
  );
}
