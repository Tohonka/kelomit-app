import {useEffect, useMemo, useState} from 'react';
import {PairSheet} from './panes/PairSheet.tsx';
import {Sidebar} from './panes/Sidebar.tsx';
import {DayView} from './panes/DayView.tsx';
import {Inspector} from './panes/Inspector.tsx';
import type {Selection} from './panes/Inspector.tsx';
import {QueueSheet} from './panes/QueueSheet.tsx';
import {ProjectsTags} from './panes/ProjectsTags.tsx';
import {Leave} from './panes/Leave.tsx';
import {MapView} from './panes/MapView.tsx';
import {ReportSheet} from './panes/ReportSheet.tsx';
import {Habits} from './panes/Habits.tsx';
import {Nags} from './panes/Nags.tsx';
import {FoodEditor} from './panes/Food.tsx';
import {Gallery} from './panes/Gallery.tsx';
import {Search} from './panes/Search.tsx';
import type {FoodSelection} from './panes/Food.tsx';
import {addDays, clock, monthOf, todayIso} from './lib/format.ts';
import {applyPendingDay, applyPendingEntries} from './lib/pending.ts';
import {usePhoneState} from './hooks/usePhoneState.ts';
import {useQueue} from './hooks/useQueue.ts';
import {useQuery} from './hooks/useQuery.ts';
import type {CompanionApi} from '../preload/index.ts';

declare global {
  interface Window {
    kelomit: CompanionApi;
  }
}

type View = 'day' | 'projects' | 'leave' | 'map' | 'habits' | 'nags' | 'gallery' | 'search';
const VIEWS: [View, string][] = [
  ['day', 'Day'],
  ['map', 'Map'],
  ['habits', 'Habits'],
  ['nags', 'Nags'],
  ['gallery', 'Gallery'],
  ['projects', 'Projects & Tags'],
  ['leave', 'Leave'],
  ['search', 'Search'],
];
type AppSelection = Selection | FoodSelection;
const isFood = (s: AppSelection): s is FoodSelection => s != null && (s.kind === 'food' || s.kind === 'newFood');

const NO_PROJECTS: never[] = [];
const NO_TAGS: never[] = [];

export function App() {
  const [pairing, setPairing] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const params = new URLSearchParams(location.search);
  const [date, setDate] = useState(() => params.get('date') ?? todayIso());
  const [view, setView] = useState<View>(() => (params.get('view') as View) || 'day');
  const [month, setMonth] = useState(monthOf(date));
  const [selection, setSelection] = useState<AppSelection>(null);
  const phone = usePhoneState();
  const queue = useQueue();
  const detail = useQuery('dayDetail', date);
  const food = useQuery('dayFood', date);
  const projects = useQuery('listProjects') ?? NO_PROJECTS;
  const tags = useQuery('listTags') ?? NO_TAGS;

  const entries = useMemo(
    () => applyPendingEntries(detail?.entries ?? [], queue.items, date, projects),
    [detail, queue.items, date, projects],
  );
  const day = useMemo(() => applyPendingDay(detail?.day ?? null, queue.items, date), [detail, queue.items, date]);

  const goTo = (d: string) => {
    setDate(d);
    setMonth(monthOf(d));
    setSelection(null);
  };
  const openEntry = (d: string, id: number) => {
    goTo(d);
    setSelection({kind: 'entry', id});
    setView('day');
  };

  useEffect(
    () =>
      window.kelomit.onMenu(action => {
        if (action === 'pair') setPairing(true);
        else if (action === 'today') goTo(todayIso());
        else if (action === 'prev-day') goTo(addDays(date, -1));
        else if (action === 'next-day') goTo(addDays(date, 1));
        else if (action === 'new-note') {
          setView('day');
          setSelection({kind: 'new', parentId: null});
        } else if (action === 'view-day') setView('day');
        else if (action === 'view-projects') setView('projects');
        else if (action === 'view-leave') setView('leave');
        else if (action === 'view-map') setView('map');
        else if (action === 'view-habits') setView('habits');
        else if (action === 'view-nags') setView('nags');
        else if (action === 'view-gallery') setView('gallery');
        else if (action === 'view-search') setView('search');
        else if (action === 'export-report') setShowReport(true);
      }),
    [date],
  );

  const waiting = queue.items.length;
  const failed = queue.failed.length;

  return (
    <div className="shell">
      <header className="titlebar">
        <strong>Kelomit</strong>
        <button className="btn" onClick={() => {
          setView('day');
          setSelection({kind: 'new', parentId: null});
        }} title="⌘N">
          + Note
        </button>
        <span className="seg views">
          {VIEWS.map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </span>
        <span className="spacer" />
        {phone.activeSession && (
          <span className="timer">
            ▶ {phone.activeSession.name || phone.activeSession.title || 'Timer'} since{' '}
            {clock(phone.activeSession.started_at)}
          </span>
        )}
        {(waiting > 0 || failed > 0) && (
          <button className={`btn queue${failed ? ' failed' : ''}`} onClick={() => setShowQueue(true)}>
            {waiting > 0 && `${waiting} waiting`}
            {waiting > 0 && failed > 0 && ' · '}
            {failed > 0 && `${failed} failed`}
          </button>
        )}
        <span className={`phone-state${phone.connected ? ' online' : ''}`}>
          {phone.connected
            ? `Phone connected${phone.appVersion ? ` · ${phone.appVersion}` : ''}`
            : 'Phone offline'}
        </span>
        <button className="btn" onClick={() => setShowReport(true)} title="⌘E">
          Report…
        </button>
        <button className="btn" onClick={() => setPairing(true)}>
          Pair phone…
        </button>
      </header>
      <main className="panes">
        <section className="pane">
          <Sidebar month={month} date={date} onMonth={setMonth} onDate={goTo} />
        </section>
        {view === 'day' && (
          <>
            <section className="pane">
              <DayView
                date={date}
                detail={detail}
                day={day}
                entries={entries}
                selectedEntryId={selection?.kind === 'entry' ? selection.id : null}
                onSelectEntry={id => setSelection(id == null ? null : {kind: 'entry', id})}
                food={food}
                selectedFoodId={selection?.kind === 'food' ? selection.id : null}
                onSelectFood={setSelection}
              />
            </section>
            <section className="pane">
              {isFood(selection) ? (
                <FoodEditor date={date} selection={selection} food={food} onClose={() => setSelection(null)} />
              ) : (
                <Inspector date={date} selection={selection} entries={entries} projects={projects} tags={tags} onSelect={setSelection} />
              )}
            </section>
          </>
        )}
        {view === 'projects' && (
          <section className="pane wide">
            <ProjectsTags projects={projects} tags={tags} />
          </section>
        )}
        {view === 'leave' && (
          <section className="pane wide">
            <Leave year={Number(month.slice(0, 4))} />
          </section>
        )}
        {view === 'habits' && (
          <section className="pane wide">
            <Habits month={month} onMonth={setMonth} projects={projects} tags={tags} queue={queue.items} />
          </section>
        )}
        {view === 'nags' && (
          <section className="pane wide">
            <Nags />
          </section>
        )}
        {view === 'gallery' && (
          <section className="pane wide">
            <Gallery month={month} onMonth={setMonth} onOpen={openEntry} />
          </section>
        )}
        {view === 'search' && (
          <section className="pane wide">
            <Search onOpen={openEntry} />
          </section>
        )}
        {view === 'map' && (
          <section className="pane wide">
            <MapView date={date} />
          </section>
        )}
      </main>
      {pairing && <PairSheet onClose={() => setPairing(false)} />}
      {showQueue && <QueueSheet queue={queue} onClose={() => setShowQueue(false)} />}
      {showReport && <ReportSheet onClose={() => setShowReport(false)} />}
    </div>
  );
}
