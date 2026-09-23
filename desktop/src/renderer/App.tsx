import {useEffect, useState} from 'react';
import {PairSheet} from './panes/PairSheet.tsx';
import type {CompanionApi} from '../preload/index.ts';

declare global {
  interface Window {
    kelomit: CompanionApi;
  }
}

export function App() {
  const [pairing, setPairing] = useState(false);

  useEffect(
    () =>
      window.kelomit.onMenu(action => {
        if (action === 'pair') {
          setPairing(true);
        }
      }),
    [],
  );

  return (
    <div className="shell">
      <header className="titlebar">
        <strong>Kelomit</strong>
        <span className="spacer" />
        <span className="phone-state">Phone offline</span>
        <button className="btn" onClick={() => setPairing(true)}>
          Pair phone…
        </button>
      </header>
      <main className="panes">
        <section className="pane">
          <div className="empty">Days</div>
        </section>
        <section className="pane">
          <div className="empty">No data yet — pair the phone and it will push its database here.</div>
        </section>
        <section className="pane">
          <div className="empty">Inspector</div>
        </section>
      </main>
      {pairing && <PairSheet onClose={() => setPairing(false)} />}
    </div>
  );
}
