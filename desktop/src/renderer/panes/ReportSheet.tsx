import {useEffect, useState} from 'react';
import type {ReportParams} from '../../main/report.ts';

/** File → Export Work Report… (⌘E). One click to a PDF, opened when saved. */
export function ReportSheet({onClose}: {onClose: () => void}) {
  const [p, setP] = useState<ReportParams | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.kelomit.reportDefaults().then(setP).catch(() => {});
  }, []);

  const set = <K extends keyof ReportParams>(k: K, v: ReportParams[K]) => setP(x => (x ? {...x, [k]: v} : x));

  const run = async () => {
    if (!p) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.kelomit.reportPdf(p);
      if (r.ok) {
        setMessage(`Saved ${r.path}`);
      } else if (!('cancelled' in r)) {
        setMessage(r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet report-sheet" onClick={e => e.stopPropagation()}>
        <h2>Work-hours report</h2>
        {p ? (
          <div className="form">
            <div className="row">
              <label>
                <span>From</span>
                <input type="date" value={p.from} onChange={e => set('from', e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={p.to} min={p.from} onChange={e => set('to', e.target.value)} />
              </label>
            </div>
            <label>
              <span>Name</span>
              <input value={p.person} onChange={e => set('person', e.target.value)} />
            </label>
            <label>
              <span>Company</span>
              <input value={p.company} onChange={e => set('company', e.target.value)} />
            </label>
            <div className="row">
              <label>
                <span>Type</span>
                <select value={p.type} onChange={e => set('type', e.target.value as ReportParams['type'])}>
                  <option value="hours">Hours</option>
                  <option value="headlines">Hours + headlines</option>
                  <option value="statistics">Hours + statistics</option>
                </select>
              </label>
              <label>
                <span>Language</span>
                <select value={p.language} onChange={e => set('language', e.target.value as ReportParams['language'])}>
                  <option value="fi">Suomi</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          </div>
        ) : (
          <p>…</p>
        )}
        {message && <p className="muted">{message}</p>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !p}>
            {busy ? 'Printing…' : 'Save PDF…'}
          </button>
        </div>
      </div>
    </div>
  );
}
