import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDayStore} from '../store/dayStore';
import {useLocationStore} from '../store/locationStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {useShellPadding} from '../navigation/shellMetrics';
import {useDayMapData, DayMapCanvas, formatDistance} from './DayMapScreen';
import {visitedLocations, type Visit} from '../utils/visitedLocations';
import {resolvePlaceName} from '../services/placesService';
import {formatTime, formatDuration} from '../utils/dateUtils';
import type {Entry} from '../types';
import type {RootStackParamList} from '../navigation/navigationTypes';

// "Map" major-feature tab = today's map, laid out per the nav-redesign prototype:
// a rounded map card with a distance/time pill, a full-screen button, and a list
// of the places visited today (see visitedLocations).
export default function MapTab() {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useDayStore(s => s.today);
  const loadToday = useDayStore(s => s.loadToday);
  const {loaded, load} = useLocationStore();

  useEffect(() => { if (!today) { loadToday(); } }, [today, loadToday]);
  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);

  if (!today) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <MapTabView
      dayId={today.id}
      styles={styles}
      colors={colors}
      topInset={shellPad.paddingTop}
      bottomInset={shellPad.paddingBottom}
      onFullScreen={() => navigation.navigate('DayMap', {dayId: today.id, date: today.date})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: today.id})}
    />
  );
}

function MapTabView({
  dayId, styles, colors, topInset, bottomInset, onFullScreen, onOpenEntry,
}: {
  dayId: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
  topInset: number;
  bottomInset: number;
  onFullScreen: () => void;
  onOpenEntry: (entry: Entry) => void;
}) {
  const {t} = useTranslation();
  const {routeCoords, buckets, region, stats, points, isEmpty} = useDayMapData(dayId);
  const locations = useLocationStore(s => s.locations);
  const visits = useMemo(() => visitedLocations(points, locations), [points, locations]);

  return (
    <ScrollView
      style={{backgroundColor: colors.bg}}
      contentContainerStyle={[styles.content, {paddingTop: topInset, paddingBottom: bottomInset + spacing.xl}]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('map.todaysMap')}</Text>
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

function LocationsList({visits, styles}: {visits: Visit[]; styles: ReturnType<typeof makeStyles>}) {
  const {t} = useTranslation();
  // Resolve names for stays that don't match a saved place (Places seam; stub → no-op).
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
