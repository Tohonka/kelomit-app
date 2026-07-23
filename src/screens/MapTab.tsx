import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {format} from 'date-fns';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDayStore} from '../store/dayStore';
import {useLocationStore} from '../store/locationStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {useShellPadding} from '../navigation/shellMetrics';
import {getDateFnsLocale} from '../i18n';
import {useDayMapData, DayMapCanvas, DayMapView, formatDistance} from './DayMapScreen';
import {visitedLocations, type Visit} from '../utils/visitedLocations';
import {resolvePlaceName} from '../services/placesService';
import {formatTime, formatDuration} from '../utils/dateUtils';
import type {Entry} from '../types';
import type {RootStackParamList, RootStackScreenProps} from '../navigation/navigationTypes';

// The rich map screen from the nav-redesign prototype: header + distance/time
// pill, rounded map card, a Full-screen button, and a "Locations" list of the
// places visited that day (see visitedLocations). Shared by the Map tab
// (today) and the pushed DayMap route (any day from the calendar).
export function MapOverview({
  dayId, title, topInset, bottomInset, onFullScreen, onOpenEntry,
}: {
  dayId: number;
  title: string;
  topInset: number;
  bottomInset: number;
  onFullScreen: () => void;
  onOpenEntry: (entry: Entry) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {locations, loaded, load} = useLocationStore();
  const {routeCoords, buckets, region, stats, points, isEmpty} = useDayMapData(dayId);
  const visits = useMemo(() => visitedLocations(points, locations), [points, locations]);

  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);

  return (
    <ScrollView
      style={{backgroundColor: colors.bg}}
      contentContainerStyle={[styles.content, {paddingTop: topInset || spacing.md, paddingBottom: bottomInset + spacing.xl}]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {points.length > 0 && (
          <View style={styles.statPill}>
            <Text style={styles.statPillText}>
              {formatDistance(stats.distanceM)} · {formatDuration(stats.durationSec)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.mapCard}>
        {isEmpty ? (
          <View style={styles.mapEmpty}>
            <Text style={styles.mapEmptyIcon}>🗺️</Text>
            <Text style={styles.mapEmptyText}>{t('dayMap.empty')}</Text>
          </View>
        ) : (
          <>
            <DayMapCanvas
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

      <Text style={styles.sectionHeader}>{t('map.locations')}</Text>
      <LocationsList visits={visits} styles={styles} />
    </ScrollView>
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

function LocationsList({visits, styles}: {visits: Visit[]; styles: ReturnType<typeof makeStyles>}) {
  const {t} = useTranslation();
  // Resolve names for stays that don't match a saved place (Places seam).
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const v of visits) {
        if (v.location) { continue; }
        const name = await resolvePlaceName(v.latitude, v.longitude);
        if (name) { next[visitKey(v)] = name; }
      }
      if (active && Object.keys(next).length) { setNames(next); }
    })();
    return () => { active = false; };
  }, [visits]);

  if (visits.length === 0) {
    return <Text style={styles.locEmpty}>{t('map.noVisits')}</Text>;
  }
  return (
    <View style={styles.locCard}>
      {visits.map((v, i) => {
        const name = v.location?.name ?? names[visitKey(v)] ?? t('map.unknownPlace');
        const dur = formatDuration((new Date(v.endTs).getTime() - new Date(v.startTs).getTime()) / 1000);
        return (
          <View key={visitKey(v)} style={[styles.locRow, i === visits.length - 1 && styles.locRowLast]}>
            <View style={styles.pin} />
            <View style={styles.locTextWrap}>
              <Text style={styles.locName}>{name}</Text>
              <Text style={styles.locTime}>{formatTime(v.startTs)} – {formatTime(v.endTs)}</Text>
            </View>
            <View style={styles.durBadge}><Text style={styles.durBadgeText}>{dur}</Text></View>
          </View>
        );
      })}
    </View>
  );
}

const visitKey = (v: Visit) => `${v.latitude.toFixed(5)},${v.longitude.toFixed(5)},${v.startTs}`;

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
