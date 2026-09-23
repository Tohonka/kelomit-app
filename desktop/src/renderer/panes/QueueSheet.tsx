import type {QueueSnapshot} from '../../main/queue.ts';

/** What is waiting for the phone, and what the phone refused. */
export function QueueSheet({queue, onClose}: {queue: QueueSnapshot; onClose: () => void}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet queue-sheet" onClick={e => e.stopPropagation()}>
        <h2>Changes</h2>
        {queue.items.length === 0 && queue.failed.length === 0 && <p className="muted">Nothing pending.</p>}
        {queue.items.length > 0 && (
          <>
            <h3>Waiting for the phone</h3>
            <ul>
              {queue.items.map(item => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  {queue.sending === item.id ? (
                    <span className="muted">sending…</span>
                  ) : (
                    <button className="btn" onClick={() => window.kelomit.queueRemove(item.id)}>
                      Discard
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {queue.failed.length > 0 && (
          <>
            <h3>Refused by the phone</h3>
            <ul>
              {queue.failed.map(f => (
                <li key={f.item.id}>
                  <span>
                    {f.item.label}
                    <br />
                    <span className="muted">{f.error}</span>
                  </span>
                  <button className="btn" onClick={() => window.kelomit.queueDismiss(f.item.id)}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
