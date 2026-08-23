import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import MapView, {Polyline, Marker, PROVIDER_GOOGLE, Region} from 'react-native-maps';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import {useEntryStore} from '../store/entryStore';
import {getDayRouteHistory} from '../db/routeHistory';
import {getEntriesForDay} from '../db/entries';
import {refreshRouteDayIfStale} from '../services/routeHistoryService';
import {diag} from '../services/diag';
import {bucketLocations, type LocationBucket} from '../utils/bucketLocations';
import {regionFor} from '../utils/mapRegion';
import {flatMapStyle} from '../components/map/mapStyle';
import {formatDuration} from '../utils/dateUtils';
import {sliceByModeSpans} from '../utils/tripModes';
import LocationMarker from '../components/map/LocationMarker';
import MarkerNotesSheet from '../components/map/MarkerNotesSheet';
import TripDetailsModal from '../components/map/TripDetailsModal';
import {tripEndpointNames} from '../components/map/TripList';
import type {
  DayRouteSegment,
  DayRouteStop,
  Entry,
  RouteCoordinate,
  TripMode,
} from '../types';

/** Dash pattern per trip mode — dots for walking, dashes for cycling, solid
 *  (no pattern) for vehicle/still/unknown. */
const DASH_BY_MODE: Partial<Record<TripMode, number[]>> = {
  foot: [1, 12],
  cycle: [14, 10],
};

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export const ROUTE_SEGMENT_COLORS = [
  '#2563EB',
  '#D97706',
  '#059669',
  '#9333EA',
  '#DC2626',
];

const EMPTY_STOPS: DayRouteStop[] = [];
const EMPTY_SEGMENTS: DayRouteSegment[] = [];

export interface DayMapData {
  segments: DayRouteSegment[];
  stops: DayRouteStop[];
  routeCoords: RouteCoordinate[];
  buckets: LocationBucket[];
  region: Region | undefined;
  stats: {distanceM: number; durationSec: number};
  isReady: boolean;
  isEmpty: boolean;
  reloadRouteHistory: () => Promise<void>;
}

async function readDayMapData(dayId: number) {
  const [history, entries] = await Promise.all([
    getDayRouteHistory(dayId),
    getEntriesForDay(dayId).catch(() => null),
  ]);
  return {...history, entries};
}

export async function loadDayMapData(dayId: number) {
  await refreshRouteDayIfStale(dayId).catch(error => {
    diag('route.refresh.fail', String(error), {dayId});
  });
  return readDayMapData(dayId);
}

/** Loads and derives a day's map data. Shared by the DayMap route and Map tab. */
export function useDayMapData(dayId: number): DayMapData {
  const setEntriesForDay = useEntryStore(state => state.setEntriesForDay);
  const [loaded, setLoaded] = useState<{
    dayId: number;
    stops: DayRouteStop[];
    segments: DayRouteSegment[];
    entries: Entry[];
  } | null>(null);
  const currentDayId = useRef(dayId);
  const loadGeneration = useRef(0);
  currentDayId.current = dayId;

  const accept = useCallback(
    (
      next: Awaited<ReturnType<typeof readDayMapData>>,
      generation: number,
    ) => {
      if (
        currentDayId.current === dayId &&
        loadGeneration.current === generation
      ) {
        if (next.entries !== null) {
          setEntriesForDay(dayId, next.entries);
        }
        setLoaded({dayId, ...next, entries: next.entries ?? []});
      }
    },
    [dayId, setEntriesForDay],
  );

  const reloadRouteHistory = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const next = await readDayMapData(dayId);
    accept(next, generation);
  }, [accept, dayId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const generation = ++loadGeneration.current;
      loadDayMapData(dayId)
        .then(next => {
          if (active) {
            accept(next, generation);
          }
        })
        .catch(() => {});
      return () => { active = false; };
    }, [accept, dayId]),
  );

  const active = loaded?.dayId === dayId ? loaded : null;
  const stops = active?.stops ?? EMPTY_STOPS;
  const segments = active?.segments ?? EMPTY_SEGMENTS;
  const buckets = useMemo(
    () => bucketLocations(active?.entries ?? [], 50),
    [active],
  );
  const routeCoords = useMemo(
    () => segments.flatMap(segment => segment.coordinates),
    [segments],
  );
  const region = useMemo(
    () => regionFor([...routeCoords, ...buckets.map(b => ({latitude: b.latitude, longitude: b.longitude}))]),
    [routeCoords, buckets],
  );
  const stats = useMemo(
    () =>
      segments.reduce(
        (sum, segment) => ({
          distanceM: sum.distanceM + segment.distance_m,
          durationSec: sum.durationSec + segment.duration_sec,
        }),
        {distanceM: 0, durationSec: 0},
      ),
    [segments],
  );

  return {
    segments,
    stops,
    routeCoords,
    buckets,
    region,
    stats,
    isReady: active != null,
    isEmpty: routeCoords.length === 0 && buckets.length === 0,
    reloadRouteHistory,
  };
}

/** Presentational map: route line, start/end dots, content markers + notes sheet.
 *  `interactive={false}` freezes pan/zoom so it can sit inside a ScrollView card. */
export function DayMapCanvas({
  segments,
  routeCoords,
  buckets,
  region,
  onOpenEntry,
  onPressSegment,
  style,
  interactive = true,
}: {
  segments: DayRouteSegment[];
  routeCoords: RouteCoordinate[];
  buckets: LocationBucket[];
  region: Region | undefined;
  onOpenEntry: (entry: Entry) => void;
  onPressSegment?: (segment: DayRouteSegment) => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  const [openBucket, setOpenBucket] = useState<LocationBucket | null>(null);
  const dotStyles = useMemo(() => makeDotStyles(), []);
  return (
    <>
      <MapView
        provider={PROVIDER_GOOGLE}
        customMapStyle={flatMapStyle}
        style={style}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}>
        {segments.flatMap((segment, index) => {
          const color = ROUTE_SEGMENT_COLORS[index % ROUTE_SEGMENT_COLORS.length];
          return sliceByModeSpans(segment.coordinates, segment.mode_spans).map(
            (slice, sliceIndex) => (
              <Polyline
                key={`${segment.id}:${sliceIndex}`}
                coordinates={slice.coordinates}
                strokeColor={color}
                strokeWidth={4}
                lineDashPattern={DASH_BY_MODE[slice.mode]}
                tappable={interactive && onPressSegment != null}
                onPress={() => onPressSegment?.(segment)}
              />
            ),
          );
        })}
        {routeCoords.length > 0 && (
          <Marker coordinate={routeCoords[0]} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
            <View style={[dotStyles.dot, dotStyles.startDot]} />
          </Marker>
        )}
        {routeCoords.length >= 2 && (
          <Marker coordinate={routeCoords[routeCoords.length - 1]} anchor={{x: 0.5, y: 0.5}} tracksViewChanges={false}>
            <View style={[dotStyles.dot, dotStyles.endDot]} />
          </Marker>
        )}
        {buckets.map(bucket => (
          <LocationMarker
            key={bucket.entries[0].id}
            bucket={bucket}
            onPress={() =>
              bucket.entries.length === 1 ? onOpenEntry(bucket.entries[0]) : setOpenBucket(bucket)
            }
          />
        ))}
      </MapView>
      <MarkerNotesSheet
        entries={openBucket?.entries ?? null}
        onSelect={onOpenEntry}
        onClose={() => setOpenBucket(null)}
      />
    </>
  );
}

/** Full-bleed map for one day — the pushed DayMapFull route. `topInset` clears
 *  the floating top bar when a caller embeds it without a native header. */
export function DayMapView({dayId, onOpenEntry, topInset = 0}: {dayId: number; onOpenEntry: (entry: Entry) => void; topInset?: number}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {segments, stops, routeCoords, buckets, region, stats, isReady, isEmpty} =
    useDayMapData(dayId);
  const [selectedSegment, setSelectedSegment] = useState<DayRouteSegment | null>(null);
  const stopsById = useMemo(() => new Map(stops.map(stop => [stop.id, stop])), [stops]);
  const endpoints = selectedSegment
    ? tripEndpointNames(selectedSegment, stopsById, {
        dayStart: t('map.dayStart'), dayEnd: t('map.dayEnd'), unknown: t('map.unknown'),
      })
    : {origin: '', destination: ''};

  if (!isReady || isEmpty) {
    return (
      <SafeAreaView style={styles.empty} edges={['bottom']}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyText}>{t('dayMap.empty')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {segments.length > 0 && (
        <View style={[styles.stats, topInset > 0 && {paddingTop: topInset}]}>
          <Text style={styles.statText}>
            {t('dayMap.distance')}: {formatDistance(stats.distanceM)}
          </Text>
          <Text style={styles.statText}>
            {t('dayMap.duration')}: {formatDuration(stats.durationSec)}
          </Text>
        </View>
      )}
      <DayMapCanvas
        segments={segments}
        routeCoords={routeCoords}
        buckets={buckets}
        region={region}
        onOpenEntry={onOpenEntry}
        onPressSegment={setSelectedSegment}
        style={styles.map}
      />
      <TripDetailsModal
        visible={selectedSegment != null}
        segment={selectedSegment}
        originName={endpoints.origin}
        destinationName={endpoints.destination}
        onClose={() => setSelectedSegment(null)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    map: {flex: 1},
    stats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    statText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm, backgroundColor: c.bg},
    emptyIcon: {fontSize: 44},
    emptyText: {color: c.textMuted, fontSize: typography.sizes.base, textAlign: 'center'},
  });

const makeDotStyles = () =>
  StyleSheet.create({
    dot: {width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff'},
    startDot: {backgroundColor: '#2e9e4f'},
    endDot: {backgroundColor: '#d23b3b'},
  });
