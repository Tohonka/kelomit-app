import {useEffect, useState} from 'react';
import {PairSheet} from './panes/PairSheet.tsx';
import {Sidebar} from './panes/Sidebar.tsx';
import {DayView} from './panes/DayView.tsx';
import {Inspector} from './panes/Inspector.tsx';
import {addDays, monthOf, todayIso} from './lib/format.ts';
import type {CompanionApi} from '../preload/index.ts';

declare global {
  interface Window {
    kelomit: CompanionApi;
  }
}

export function App() {
  const [pairing, setPairing] = useState(false);
  const [date, setDate] = useState(() => new URLSearchParams(location.search).get('date') ?? todayIso());
  const [month, setMonth] = useState(monthOf(date));
  const [entryId, setEntryId] = useState<number | null>(null);

  const goTo = (d: string) => {
    setDate(d);
    setMonth(monthOf(d));
    setEntryId(null);
  };

  useEffect(
    () =>
      window.kelomit.onMenu(action => {
        if (action === 'pair') setPairing(true);
        else if (action === 'today') goTo(todayIso());
        else if (action === 'prev-day') goTo(addDays(date, -1));
        else if (action === 'next-day') goTo(addDays(date, 1));
      }),
    [date],
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
          <Sidebar month={month} date={date} onMonth={setMonth} onDate={goTo} />
        </section>
        <section className="pane">
          <DayView date={date} selectedEntryId={entryId} onSelectEntry={setEntryId} />
        </section>
        <section className="pane">
          <Inspector date={date} entryId={entryId} />
        </section>
      </main>
      {pairing && <PairSheet onClose={() => setPairing(false)} />}
    </div>
  );
}
