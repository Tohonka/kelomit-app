import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useQuery} from '../hooks/useQuery.ts';
import {clock, formatHours} from '../lib/format.ts';
import {sliceByModeSpans} from '../../../../src/utils/tripModes.ts';
import {distanceMeters} from '../../../../src/services/locationUtils.ts';
import {MAX_RADIUS_M, MIN_RADIUS_M} from '../../../../src/utils/geofence.ts';
import type {DayRouteStop, TripMode} from '../../../../src/types/index.ts';
import type {PlaceList} from '../../main/life.ts';

/** Same mode hues as the phone's route map: vehicle pink, foot cyan, cycle amber. */
const MODE_VAR: Record<TripMode, string> = {
  vehicle: '--accentPink',
  foot: '--accentCyan',
  cycle: '--accentAmber',
  still: '--textMuted',
  unknown: '--textSecondary',
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
const cmd = (fn: string, args: unknown[], label: string) => window.kelomit.cmd(fn, args, label).catch(() => {});

const SOURCE_LABEL: Record<string, string> = {saved: 'saved place', reusable: 'named place', google: 'Google', day: 'this day', unknown: ''};

type Nearby = {type: 'saved' | 'reusable'; id: number; name: string; distanceM: number};

/** Saved / named places whose radius covers the stop, nearest first — what the
 *  phone offers first when naming a stop. */
function nearbyPlaces(stop: DayRouteStop, places: PlaceList | null | undefined): Nearby[] {
  if (!places) return [];
  const out: Nearby[] = [];
  for (const l of places.saved) {
    const d = distanceMeters(stop.latitude, stop.longitude, l.latitude, l.longitude);
    if (d <= l.radius_m) out.push({type: 'saved', id: l.id, name: l.name, distanceM: d});
  }
  for (const p of places.named) {
    const d = distanceMeters(stop.latitude, stop.longitude, p.latitude, p.longitude);
    if (d <= p.radius_m) out.push({type: 'reusable', id: p.id, name: p.name, distanceM: d});
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

function StopRow({stop, places, active, onFocus}: {stop: DayRouteStop; places: PlaceList | null | undefined; active: boolean; onFocus: () => void}) {
  const [name, setName] = useState(stop.display_name ?? '');
  useEffect(() => setName(stop.display_name ?? ''), [stop.display_name, stop.id]);
  const nearby = nearbyPlaces(stop, places);
  const label = `Stop ${clock(stop.start_ts)}–${clock(stop.end_ts)}`;

  const commit = () => {
    const n = name.trim();
    if (!n || n === (stop.display_name ?? '')) return;
    const hit = nearby.find(p => p.name.toLowerCase() === n.toLowerCase());
    const choice = hit ? {type: hit.type, id: hit.id, name: hit.name} : {type: 'day', name: n};
    cmd('stops.setName', [stop.id, choice], `${label} → “${n}”`);
  };
  const saveAsPlace = () => {
    const n = prompt('Name this place (reused for every stop within its radius)', name.trim())?.trim();
    if (n) cmd('stops.createPlace', [stop.id, n], `New place “${n}” from ${label}`);
  };

  return (
    <div className={`stop${active ? ' active' : ''}`} onClick={onFocus}>
      <div className="stop-head">
        <span className="num">
          {clock(stop.start_ts)}–{clock(stop.end_ts)}
        </span>
        {stop.name_source !== 'unknown' && <span className="chip">{SOURCE_LABEL[stop.name_source]}</span>}
      </div>
      <div className="row">
        <input
          list={`near-${stop.id}`}
          placeholder="Unnamed stop"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <datalist id={`near-${stop.id}`}>
          {nearby.map(p => (
            <option key={`${p.type}${p.id}`} value={p.name}>
              {Math.round(p.distanceM)} m · {p.type === 'saved' ? 'saved' : 'named'}
            </option>
          ))}
        </datalist>
        {stop.named_place_id == null && stop.saved_location_id == null && (
          <button className="btn small" onClick={saveAsPlace} title="Create a named place at this stop">
            Save as place
          </button>
        )}
      </div>
    </div>
  );
}

function RadiusField({value, onCommit}: {value: number; onCommit: (m: number) => void}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input
      type="number"
      min={MIN_RADIUS_M}
      max={MAX_RADIUS_M}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n);
      }}
    />
  );
}

function NameField({value, onCommit}: {value: string; onCommit: (name: string) => void}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => {
        const n = v.trim();
        if (n && n !== value) onCommit(n);
      }}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function PlacesPanel({places}: {places: PlaceList | null | undefined}) {
  if (!places) return <p className="muted">…</p>;
  return (
    <div className="places">
      <h3>Named places</h3>
      <table>
        <tbody>
          {places.named.map(p => (
            <tr key={p.id}>
              <td>
                <NameField value={p.name} onCommit={n => cmd('places.rename', [p.id, n], `Rename place “${p.name}” → “${n}”`)} />
              </td>
              <td className="num">
                <RadiusField value={p.radius_m} onCommit={m => cmd('places.setRadius', [p.id, m], `Radius of “${p.name}” → ${m} m`)} /> m
              </td>
              <td className="muted num">{p.uses}×</td>
              <td className="actions">
                <button className="btn small danger" onClick={() => confirm(`Delete place “${p.name}”? Stops keep their names.`) && cmd('places.delete', [p.id], `Delete place “${p.name}”`)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {places.named.length === 0 && (
            <tr>
              <td className="muted">None yet — “Save as place” on a stop.</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3>Saved locations (geofences)</h3>
      <table>
        <tbody>
          {places.saved.map(l => (
            <tr key={l.id}>
              <td>
                <NameField value={l.name} onCommit={n => cmd('locations.rename', [l.id, n], `Rename location “${l.name}” → “${n}”`)} />
                <div className="muted">{l.kind}</div>
              </td>
              <td className="num">
                <RadiusField value={l.radius_m} onCommit={m => cmd('locations.setRadius', [l.id, m], `Radius of “${l.name}” → ${m} m`)} /> m
              </td>
              <td className="muted num">{l.uses}×</td>
              <td className="actions">
                <button className="btn small danger" onClick={() => confirm(`Delete location “${l.name}” and its geofence?`) && cmd('locations.delete', [l.id], `Delete location “${l.name}”`)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {places.saved.length === 0 && (
            <tr>
              <td className="muted">No saved locations. New ones are added on the phone.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The day's trips and stops on OpenStreetMap tiles; a side column names the
 *  stops and manages the places. Routes themselves stay read-only. */
export function MapView({date}: {date: string}) {
  const route = useQuery('dayRoute', date);
  const places = useQuery('listPlaces');
  const [side, setSide] = useState<'stops' | 'places'>('stops');
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<number, L.CircleMarker>>(new Map());

  useEffect(() => {
    if (!host.current || map.current) return;
    map.current = L.map(host.current, {zoomControl: true}).setView([60.45, 22.27], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    if (!route || (route.trips.length === 0 && route.stops.length === 0)) return;
    const bounds = L.latLngBounds([]);
    for (const trip of route.trips) {
      for (const slice of sliceByModeSpans(trip.coordinates, trip.mode_spans)) {
        const pts = slice.coordinates.map(c => [c.latitude, c.longitude] as [number, number]);
        pts.forEach(p => bounds.extend(p));
        L.polyline(pts, {color: cssVar(MODE_VAR[slice.mode]), weight: 4, opacity: 0.9})
          .bindTooltip(`${clock(trip.start_ts)}–${clock(trip.end_ts)} · ${(trip.distance_m / 1000).toFixed(1)} km · ${formatHours(trip.duration_sec)} · ${slice.mode}`)
          .addTo(g);
      }
    }
    for (const stop of route.stops) {
      const p: [number, number] = [stop.latitude, stop.longitude];
      bounds.extend(p);
      const marker = L.circleMarker(p, {radius: 7, color: cssVar('--bg'), weight: 2, fillColor: cssVar('--primary'), fillOpacity: 1})
        .bindTooltip(`${stop.display_name ?? 'Unnamed stop'} · ${clock(stop.start_ts)}–${clock(stop.end_ts)}`)
        .on('click', () => setActiveStop(stop.id))
        .addTo(g);
      markers.current.set(stop.id, marker);
    }
    if (bounds.isValid()) m.fitBounds(bounds, {padding: [30, 30]});
  }, [route]);

  const focusStop = (stop: DayRouteStop) => {
    setActiveStop(stop.id);
    map.current?.panTo([stop.latitude, stop.longitude]);
    markers.current.get(stop.id)?.openTooltip();
  };

  const km = route ? route.trips.reduce((s, t) => s + t.distance_m, 0) / 1000 : 0;

  return (
    <div className="mapview">
      <div className="map-summary">
        {route === undefined
          ? '…'
          : !route || route.trips.length === 0
            ? 'No route recorded on this day.'
            : `${route.trips.length} ${route.trips.length === 1 ? 'trip' : 'trips'} · ${km.toFixed(1)} km · ${route.stops.length} stops`}
        <span className="legend">
          <span style={{color: 'var(--accentPink)'}}>● vehicle</span>
          <span style={{color: 'var(--accentCyan)'}}>● foot</span>
          <span style={{color: 'var(--accentAmber)'}}>● cycle</span>
        </span>
      </div>
      <div ref={host} className="map" />
      <aside className="map-side">
        <span className="seg">
          <button className={side === 'stops' ? 'on' : ''} onClick={() => setSide('stops')}>
            Stops
          </button>
          <button className={side === 'places' ? 'on' : ''} onClick={() => setSide('places')}>
            Places
          </button>
        </span>
        {side === 'stops' ? (
          <div className="stops">
            {(route?.stops ?? []).map(s => (
              <StopRow key={s.id} stop={s} places={places} active={s.id === activeStop} onFocus={() => focusStop(s)} />
            ))}
            {route && route.stops.length === 0 && <p className="muted">No stops on this day.</p>}
          </div>
        ) : (
          <PlacesPanel places={places} />
        )}
      </aside>
    </div>
  );
}
