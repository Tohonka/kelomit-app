import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {format} from 'date-fns';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDayStore} from '../store/dayStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {useShellPadding} from '../navigation/shellMetrics';
import {getDateFnsLocale} from '../i18n';
import {useDayMapData, DayMapCanvas, DayMapView, formatDistance} from './DayMapScreen';
import {
  createNamedPlaceForStop,
  getNearbyLocalPlaces,
  setAutomaticGoogleStopName,
  setDayStopName,
} from '../db/routeHistory';
import {
  resolvePlaceCandidates,
  resolvePlaceSnapshot,
} from '../services/placesService';
import {formatTime, formatDuration} from '../utils/dateUtils';
import PlaceNameSheet, {
  type LocalPlaceChoice,
  type PlaceNameChoice,
} from '../components/map/PlaceNameSheet';
import TripList, {tripEndpointNames, type TripNotePrefill} from '../components/map/TripList';
import TripDetailsModal from '../components/map/TripDetailsModal';
import type {DayRouteSegment, DayRouteStop, Entry} from '../types';
import type {PlaceCandidate} from '../services/placesService';
import type {RootStackParamList, RootStackScreenProps} from '../navigation/navigationTypes';

// The rich map screen from the nav-redesign prototype: header + distance/time
// pill, rounded map card, a Full-screen button, and a "Locations" list of the
// persisted places visited that day. Shared by the Map tab
// (today) and the pushed DayMap route (any day from the calendar).
export function MapOverview({
  dayId, title, topInset, bottomInset, onFullScreen, onOpenEntry, onAddNote,
}: {
  dayId: number;
  title: string;
  topInset: number;
  bottomInset: number;
  onFullScreen: () => void;
  onOpenEntry: (entry: Entry) => void;
  onAddNote: (prefill: TripNotePrefill) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    segments,
    stops,
    routeCoords,
    buckets,
    region,
    stats,
    isReady,
    isEmpty,
    reloadRouteHistory,
  } = useDayMapData(dayId);
  const [selectedStop, setSelectedStop] = useState<DayRouteStop | null>(null);
  const [selectedSegment, setSelectedSegment] =
    useState<DayRouteSegment | null>(null);
  const [localChoices, setLocalChoices] = useState<LocalPlaceChoice[]>([]);
  const [googleCandidates, setGoogleCandidates] = useState<PlaceCandidate[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(false);
  const currentDayId = useRef(dayId);
  const stopOpenGeneration = useRef(0);
  currentDayId.current = dayId;
  const activeStops = useMemo(
    () => stops.filter(stop => stop.day_id === dayId),
    [dayId, stops],
  );
  const selectedEndpoints = selectedSegment
    ? tripEndpointNames(
        selectedSegment,
        new Map(activeStops.map(stop => [stop.id, stop])),
        {
          dayStart: t('map.dayStart'),
          dayEnd: t('map.dayEnd'),
          unknown: t('map.unknown'),
        },
      )
    : {origin: '', destination: ''};
  const activeSelectedStop =
    selectedStop?.day_id === dayId ? selectedStop : null;

  useEffect(() => {
    stopOpenGeneration.current += 1;
    setSelectedStop(null);
    setSelectedSegment(null);
    setLocalChoices([]);
    setGoogleCandidates([]);
    setGoogleError(false);
    setGoogleLoading(false);
  }, [dayId]);

  useEffect(() => {
    let active = true;
    const unnamedStops = activeStops.filter(
      stop => !stop.user_edited && !stop.display_name?.trim(),
    );
    if (unnamedStops.length === 0) {
      return;
    }
    (async () => {
      let changed = false;
      for (const stop of unnamedStops) {
        let snapshot;
        try {
          snapshot = await resolvePlaceSnapshot(
            stop.latitude,
            stop.longitude,
          );
        } catch {
          continue;
        }
        if (!active || currentDayId.current !== dayId) {
          return;
        }
        if (!snapshot) {
          continue;
        }
        try {
          const updated = await setAutomaticGoogleStopName(stop.id, snapshot);
          changed = updated || changed;
        } catch {
          continue;
        }
      }
      if (changed && active && currentDayId.current === dayId) {
        await reloadRouteHistory();
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [activeStops, dayId, reloadRouteHistory]);

  useEffect(() => {
    if (!activeSelectedStop) {
      return;
    }
    let active = true;
    setGoogleCandidates([]);
    setGoogleError(false);
    setGoogleLoading(true);
    resolvePlaceCandidates(
      activeSelectedStop.latitude,
      activeSelectedStop.longitude,
    )
      .then(candidates => {
        if (active && currentDayId.current === dayId) {
          setGoogleCandidates(candidates);
        }
      })
      .catch(() => {
        if (active && currentDayId.current === dayId) {
          setGoogleError(true);
        }
      })
      .finally(() => {
        if (active && currentDayId.current === dayId) {
          setGoogleLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeSelectedStop, dayId]);

  const openStop = async (stop: DayRouteStop) => {
    const generation = ++stopOpenGeneration.current;
    const choices = await getNearbyLocalPlaces(
      stop.latitude,
      stop.longitude,
    ).catch(() => []);
    if (
      currentDayId.current !== dayId ||
      stop.day_id !== dayId ||
      stopOpenGeneration.current !== generation
    ) {
      return;
    }
    setLocalChoices(choices);
    setSelectedStop(stop);
  };

  const choosePlace = async (choice: PlaceNameChoice) => {
    if (!activeSelectedStop || currentDayId.current !== dayId) {
      return;
    }
    await setDayStopName(activeSelectedStop.id, choice);
    if (currentDayId.current !== dayId) {
      return;
    }
    await reloadRouteHistory();
  };

  const createName = async (name: string) => {
    if (!activeSelectedStop || currentDayId.current !== dayId) {
      return;
    }
    await createNamedPlaceForStop(activeSelectedStop.id, name);
    if (currentDayId.current !== dayId) {
      return;
    }
    await reloadRouteHistory();
  };

  return (
    <>
      <ScrollView
        style={{backgroundColor: colors.bg}}
        contentContainerStyle={[styles.content, {paddingTop: topInset || spacing.md, paddingBottom: bottomInset + spacing.xl}]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {segments.length > 0 && (
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>
                {formatDistance(stats.distanceM)} · {formatDuration(stats.durationSec)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.mapCard}>
          {!isReady || isEmpty ? (
            <View style={styles.mapEmpty}>
              <Text style={styles.mapEmptyIcon}>🗺️</Text>
              <Text style={styles.mapEmptyText}>{t('dayMap.empty')}</Text>
            </View>
          ) : (
            <>
              <DayMapCanvas
                segments={segments}
                routeCoords={routeCoords}
                buckets={buckets}
                region={region}
                onOpenEntry={onOpenEntry}
                style={styles.map}
                interactive={false}
              />
              <TouchableOpacity style={styles.fsBtn} onPress={onFullScreen} accessibilityRole="button">
                <Text style={styles.fsBtnText}>⤢ {t('map.fullScreen')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text
          style={styles.sectionHeader}
          accessibilityRole="header">
          {t('map.trips')}
        </Text>
        <TripList
          segments={segments}
          stops={activeStops}
          onPress={setSelectedSegment}
          onAddNote={onAddNote}
        />
        <Text style={[styles.sectionHeader, styles.tripsHeader]}>
          {t('map.places')}
        </Text>
        <LocationsList
          stops={activeStops}
          styles={styles}
          onPress={stop => {
            openStop(stop).catch(() => {});
          }}
        />
      </ScrollView>
      <TripDetailsModal
        visible={selectedSegment != null}
        segment={selectedSegment}
        originName={selectedEndpoints.origin}
        destinationName={selectedEndpoints.destination}
        onClose={() => setSelectedSegment(null)}
        onPressOrigin={
          selectedSegment?.origin_stop_id != null
            ? () => {
                const stop = activeStops.find(s => s.id === selectedSegment.origin_stop_id);
                if (stop) {
                  setSelectedSegment(null);
                  openStop(stop).catch(() => {});
                }
              }
            : undefined
        }
        onPressDestination={
          selectedSegment?.destination_stop_id != null
            ? () => {
                const stop = activeStops.find(s => s.id === selectedSegment.destination_stop_id);
                if (stop) {
                  setSelectedSegment(null);
                  openStop(stop).catch(() => {});
                }
              }
            : undefined
        }
      />
      <PlaceNameSheet
        visible={activeSelectedStop != null}
        currentName={activeSelectedStop?.display_name ?? null}
        localChoices={localChoices}
        googleCandidates={googleCandidates}
        googleLoading={googleLoading}
        googleError={googleError}
        onChoose={choosePlace}
        onCreateName={createName}
        onClose={() => setSelectedStop(null)}
      />
    </>
  );
}

// "Map" major-feature tab = today's map overview.
export default function MapTab() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useDayStore(s => s.today);
  const loadToday = useDayStore(s => s.loadToday);

  useFocusEffect(
    React.useCallback(() => {
      loadToday().catch(() => {});
    }, [loadToday]),
  );

  if (!today) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <MapOverview
      dayId={today.id}
      title={t('map.todaysMap')}
      topInset={shellPad.paddingTop}
      bottomInset={shellPad.paddingBottom}
      onFullScreen={() => navigation.navigate('DayMapFull', {dayId: today.id, date: today.date})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: today.id})}
      onAddNote={prefill => navigation.navigate('AddEntryModal', {dayId: today.id, date: today.date, prefill})}
    />
  );
}

/** Pushed 'DayMap' route — the same overview for a specific (usually past) day. */
export function DayMapOverviewScreen({navigation, route}: RootStackScreenProps<'DayMap'>) {
  const {dayId, date} = route.params;
  const {i18n} = useTranslation();
  const [y, m, d] = date.split('-').map(Number);
  const label = format(new Date(y, m - 1, d), 'EEE d MMM', {
    locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
  });
  return (
    <MapOverview
      dayId={dayId}
      title={label}
      topInset={0}
      bottomInset={spacing.md}
      onFullScreen={() => navigation.navigate('DayMapFull', {dayId, date})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId})}
      onAddNote={prefill => navigation.navigate('AddEntryModal', {dayId, date, prefill})}
    />
  );
}

/** Pushed 'DayMapFull' route — the full-bleed interactive map for a day. */
export function DayMapFullScreen({navigation, route}: RootStackScreenProps<'DayMapFull'>) {
  const {dayId} = route.params;
  return (
    <DayMapView
      dayId={dayId}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId})}
    />
  );
}

function LocationsList({
  stops,
  styles,
  onPress,
}: {
  stops: DayRouteStop[];
  styles: ReturnType<typeof makeStyles>;
  onPress: (stop: DayRouteStop) => void;
}) {
  const {t} = useTranslation();
  if (stops.length === 0) {
    return <Text style={styles.locEmpty}>{t('map.noVisits')}</Text>;
  }
  return (
    <View style={styles.locCard}>
      {stops.map((stop, i) => {
        const name = stop.display_name ?? t('map.unknownPlace');
        const dur = formatDuration(
          (new Date(stop.end_ts).getTime() -
            new Date(stop.start_ts).getTime()) /
            1000,
        );
        const time = `${formatTime(stop.start_ts)} – ${formatTime(stop.end_ts)}`;
        return (
          <TouchableOpacity
            key={stop.id}
            style={[
              styles.locRow,
              i === stops.length - 1 && styles.locRowLast,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${time}, ${dur}`}
            onPress={() => onPress(stop)}>
            <View style={styles.pin} />
            <View style={styles.locTextWrap}>
              <Text style={styles.locName}>{name}</Text>
              <Text style={styles.locTime}>{time}</Text>
            </View>
            <View style={styles.durBadge}><Text style={styles.durBadgeText}>{dur}</Text></View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
    content: {paddingHorizontal: spacing.lg},
    header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md},
    title: {fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: c.textPrimary},
    statPill: {backgroundColor: c.bgMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs},
    statPillText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    mapCard: {
      height: 260,
      borderRadius: radius.card,
      overflow: 'hidden',
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: spacing.lg,
    },
    map: {flex: 1},
    mapEmpty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
    mapEmptyIcon: {fontSize: 40},
    mapEmptyText: {color: c.textMuted, fontSize: typography.sizes.sm},
    fsBtn: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.md,
      backgroundColor: c.glassPill,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    fsBtnText: {color: c.textPrimary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    sectionHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    tripsHeader: {marginTop: spacing.lg},
    locEmpty: {color: c.textMuted, fontSize: typography.sizes.sm, marginLeft: spacing.xs},
    locCard: {borderRadius: radius.lg, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, overflow: 'hidden'},
    locRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border},
    locRowLast: {borderBottomWidth: 0},
    pin: {width: 20, height: 20, borderRadius: 10, backgroundColor: c.accentPink, transform: [{rotate: '45deg'}], borderBottomLeftRadius: 3},
    locTextWrap: {flex: 1},
    locName: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.semibold},
    locTime: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    durBadge: {backgroundColor: c.bgMuted, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3},
    durBadgeText: {fontSize: typography.sizes.xs, color: c.textSecondary, fontWeight: typography.weights.semibold},
  });
