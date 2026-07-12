import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import MapView, {Polyline, Marker, PROVIDER_GOOGLE, Region} from 'react-native-maps';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import {useEntryStore} from '../store/entryStore';
import {getGpsPointsForDay} from '../db/gps';
import {bucketLocations, type LocationBucket} from '../utils/bucketLocations';
import {regionFor} from '../utils/mapRegion';
import {flatMapStyle} from '../components/map/mapStyle';
import {routeStats} from '../utils/routeStats';
import {formatDuration} from '../utils/dateUtils';
import LocationMarker from '../components/map/LocationMarker';
import MarkerNotesSheet from '../components/map/MarkerNotesSheet';
import type {GpsPoint, Entry} from '../types';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'DayMap'>;

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

type Coord = {latitude: number; longitude: number};

export interface DayMapData {
  points: GpsPoint[];
  routeCoords: Coord[];
  buckets: LocationBucket[];
  region: Region | undefined;
  stats: {distanceM: number; durationSec: number};
  isEmpty: boolean;
}

/** Loads and derives a day's map data. Shared by the DayMap route and Map tab. */
export function useDayMapData(dayId: number): DayMapData {
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const [points, setPoints] = useState<GpsPoint[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadEntriesForDay(dayId);
      getGpsPointsForDay(dayId)
        .then(p => { if (active) { setPoints(p); } })
        .catch(() => {});
      return () => { active = false; };
    }, [dayId, loadEntriesForDay]),
  );

  const buckets = useMemo(
    () => bucketLocations(entriesByDay[dayId] ?? [], 50),
    [entriesByDay, dayId],
  );
  const routeCoords = useMemo(
    () => points.map(p => ({latitude: p.latitude, longitude: p.longitude})),
    [points],
  );
  const region = useMemo(
    () => regionFor([...routeCoords, ...buckets.map(b => ({latitude: b.latitude, longitude: b.longitude}))]),
    [routeCoords, buckets],
  );
  const stats = useMemo(() => routeStats(points), [points]);

  return {points, routeCoords, buckets, region, stats, isEmpty: routeCoords.length === 0 && buckets.length === 0};
}

/** Presentational map: route line, start/end dots, content markers + notes sheet.
 *  `interactive={false}` freezes pan/zoom so it can sit inside a ScrollView card. */
export function DayMapCanvas({
  routeCoords,
  buckets,
  region,
  onOpenEntry,
  style,
  interactive = true,
}: {
  routeCoords: Coord[];
  buckets: LocationBucket[];
  region: Region | undefined;
  onOpenEntry: (entry: Entry) => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) {
  const {colors} = useTheme();
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
        {routeCoords.length >= 2 && (
          <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />
        )}
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

/** Route wrapper for the root 'DayMap' screen (a specific day). */
export default function DayMapScreen({navigation, route}: Props) {
  const {dayId} = route.params;
  return (
    <DayMapView
      dayId={dayId}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId})}
    />
  );
}

/** Full-bleed map for one day — the pushed DayMap route. `topInset` clears the
 *  floating top bar when a caller embeds it without a native header. */
export function DayMapView({dayId, onOpenEntry, topInset = 0}: {dayId: number; onOpenEntry: (entry: Entry) => void; topInset?: number}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {routeCoords, buckets, region, stats, points, isEmpty} = useDayMapData(dayId);

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.empty} edges={['bottom']}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyText}>{t('dayMap.empty')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {points.length > 0 && (
        <View style={[styles.stats, topInset > 0 && {paddingTop: topInset}]}>
          <Text style={styles.statText}>
            {t('dayMap.distance')}: {formatDistance(stats.distanceM)}
          </Text>
          <Text style={styles.statText}>
            {t('dayMap.duration')}: {formatDuration(stats.durationSec)}
          </Text>
        </View>
      )}
      <DayMapCanvas routeCoords={routeCoords} buckets={buckets} region={region} onOpenEntry={onOpenEntry} style={styles.map} />
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
