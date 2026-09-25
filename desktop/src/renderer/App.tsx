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
import {FoodEditor, FoodLog} from './panes/Food.tsx';
import {HealthLog} from './panes/Health.tsx';
import {Gallery} from './panes/Gallery.tsx';
import {Search} from './panes/Search.tsx';
import {Insights} from './panes/Insights.tsx';
import {Home} from './panes/Home.tsx';
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

type View =
  | 'home'
  | 'day'
  | 'map'
  | 'insights'
  | 'search'
  | 'food'
  | 'health'
  | 'habits'
  | 'nags'
  | 'gallery'
  | 'projects'
  | 'leave';
const LABEL: Record<View, string> = {
  home: 'Home',
  day: 'Day',
  map: 'Map',
  insights: 'Insights',
  search: 'Search',
  food: 'Food',
  health: 'Health',
  habits: 'Habits',
  nags: 'Nags',
  gallery: 'Gallery',
  projects: 'Projects & Tags',
  leave: 'Leave',
};
/** The nav: flat tabs for the daily views, two dropdown groups for the rest. */
const NAV: (View | {group: string; views: View[]})[] = [
  'home',
  'day',
  'map',
  'insights',
  {group: 'Life', views: ['food', 'health', 'habits', 'nags']},
  {group: 'Library', views: ['gallery', 'projects', 'leave']},
  'search',
];
const MENU_VIEWS: Record<string, View> = {
  'view-home': 'home',
  'view-day': 'day',
  'view-map': 'map',
  'view-insights': 'insights',
  'view-search': 'search',
  'view-food': 'food',
  'view-health': 'health',
  'view-habits': 'habits',
  'view-nags': 'nags',
  'view-gallery': 'gallery',
  'view-projects': 'projects',
  'view-leave': 'leave',
};
type AppSelection = Selection | FoodSelection;
const isFood = (s: AppSelection): s is FoodSelection => s != null && (s.kind === 'food' || s.kind === 'newFood');

const NO_PROJECTS: never[] = [];
const NO_TAGS: never[] = [];

function NavGroup({group, views, view, onView}: {group: string; views: View[]; view: View; onView: (v: View) => void}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const active = views.includes(view);
  return (
    <span className="nav-group" onMouseDown={e => e.stopPropagation()}>
      <button className={active ? 'on' : open ? 'open' : ''} onClick={() => setOpen(o => !o)}>
        {active ? `${group} · ${LABEL[view]}` : group} ▾
      </button>
      {open && (
        <span className="nav-menu">
          {views.map(v => (
            <button
              key={v}
              className={view === v ? 'on' : ''}
              onClick={() => {
                onView(v);
                setOpen(false);
              }}>
              {LABEL[v]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function App() {
  const [pairing, setPairing] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const params = new URLSearchParams(location.search);
  const [date, setDate] = useState(() => params.get('date') ?? todayIso());
  const [view, setView] = useState<View>(() => (params.get('view') as View) || 'home');
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
    [detail, queue.items, date, projects]
  );
  const day = useMemo(() => applyPendingDay(detail?.day ?? null, queue.items, date), [detail, queue.items, date]);

  const goTo = (d: string) => {
    setDate(d);
    setMonth(monthOf(d));
    setSelection(null);
  };
  const openDay = (d: string) => {
    goTo(d);
    setView('day');
  };
  const openEntry = (d: string, id: number) => {
    goTo(d);
    setSelection({kind: 'entry', id});
    setView('day');
  };
  const openFood = (d: string, id: number) => {
    goTo(d);
    setSelection({kind: 'food', id});
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
        } else if (action === 'export-report') setShowReport(true);
        else if (action in MENU_VIEWS) setView(MENU_VIEWS[action]);
      }),
    [date]
  );

  const waiting = queue.items.length;
  const failed = queue.failed.length;

  return (
    <div className="shell">
      <header className="titlebar">
        <strong>Kelomit</strong>
        <button
          className="btn"
          onClick={() => {
            setView('day');
            setSelection({kind: 'new', parentId: null});
          }}
          title="⌘N">
          + Note
        </button>
        <span className="seg views">
          {NAV.map(item =>
            typeof item === 'string' ? (
              <button key={item} className={view === item ? 'on' : ''} onClick={() => setView(item)}>
                {LABEL[item]}
              </button>
            ) : (
              <NavGroup key={item.group} group={item.group} views={item.views} view={view} onView={setView} />
            )
          )}
        </span>
        <span className="spacer" />
        {phone.activeSession && (
          <span className="timer">
            ▶ {phone.activeSession.name || phone.activeSession.title || 'Timer'} since {clock(phone.activeSession.started_at)}
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
          {phone.connected ? `Phone connected${phone.appVersion ? ` · ${phone.appVersion}` : ''}` : 'Phone offline'}
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
          <Sidebar
            month={month}
            date={date}
            onMonth={setMonth}
            onDate={d => {
              goTo(d);
              if (view === 'home') setView('day');
            }}
          />
        </section>
        {view === 'home' && (
          <section className="pane wide">
            <Home onOpenDay={openDay} onOpenEntry={openEntry} />
          </section>
        )}
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
                <Inspector
                  date={date}
                  selection={selection}
                  entries={entries}
                  projects={projects}
                  tags={tags}
                  media={detail?.media ?? []}
                  onSelect={setSelection}
                />
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
        {view === 'food' && (
          <section className="pane wide">
            <FoodLog month={month} onMonth={setMonth} onOpen={openFood} />
          </section>
        )}
        {view === 'health' && (
          <section className="pane wide">
            <HealthLog month={month} onMonth={setMonth} onOpen={openDay} />
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
        {view === 'insights' && (
          <section className="pane wide">
            <Insights />
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
