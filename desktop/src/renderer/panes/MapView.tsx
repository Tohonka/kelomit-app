import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useQuery} from '../hooks/useQuery.ts';
import {clock, formatHours} from '../lib/format.ts';
import {sliceByModeSpans} from '../../../../src/utils/tripModes.ts';
import type {TripMode} from '../../../../src/types/index.ts';

/** Same mode hues as the phone's route map: vehicle pink, foot cyan, cycle amber. */
const MODE_VAR: Record<TripMode, string> = {
  vehicle: '--accentPink',
  foot: '--accentCyan',
  cycle: '--accentAmber',
  still: '--textMuted',
  unknown: '--textSecondary',
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

/** The day's trips and stops on OpenStreetMap tiles. Read-only. */
export function MapView({date}: {date: string}) {
  const route = useQuery('dayRoute', date);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

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
      L.circleMarker(p, {radius: 7, color: cssVar('--bg'), weight: 2, fillColor: cssVar('--primary'), fillOpacity: 1})
        .bindTooltip(`${stop.display_name ?? 'Unnamed stop'} · ${clock(stop.start_ts)}–${clock(stop.end_ts)}`)
        .addTo(g);
    }
    if (bounds.isValid()) m.fitBounds(bounds, {padding: [30, 30]});
  }, [route]);

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
    </div>
  );
}
