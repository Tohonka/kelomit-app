import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';
import type {DayRouteSegment, DayRouteStop} from '../../types';
import {formatDuration, formatTime} from '../../utils/dateUtils';
import {
  formatDistance,
  ROUTE_SEGMENT_COLORS,
} from '../../screens/DayMapScreen';

export interface TripNotePrefill {
  body: string;
  timeFrom: string;
  timeTo: string;
}

/** One note line per trip, in trip order; times span first start → last end. */
export function tripsToNotePrefill(
  segments: DayRouteSegment[],
  stops: Map<number, DayRouteStop>,
  labels: {dayStart: string; dayEnd: string; unknown: string},
): TripNotePrefill {
  const body = segments
    .map(segment => {
      const {origin, destination} = tripEndpointNames(segment, stops, labels);
      return `${origin} → ${destination}, ${formatTime(segment.start_ts)} – ${formatTime(
        segment.end_ts,
      )} (${formatDistance(segment.distance_m)} · ${formatDuration(segment.duration_sec)})`;
    })
    .join('\n');
  return {
    body,
    timeFrom: segments[0].start_ts,
    timeTo: segments[segments.length - 1].end_ts,
  };
}

export default function TripList({
  segments,
  stops,
  onPress,
  onAddNote,
}: {
  segments: DayRouteSegment[];
  stops: DayRouteStop[];
  onPress: (segment: DayRouteSegment) => void;
  onAddNote?: (prefill: TripNotePrefill) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stopsById = useMemo(
    () => new Map(stops.map(stop => [stop.id, stop])),
    [stops],
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Filter against current segments so a day switch can't leave stale ids live.
  const selectedSegments = segments.filter(s => selectedIds.has(s.id));

  if (segments.length === 0) {
    return <Text style={styles.empty}>{t('dayMap.empty')}</Text>;
  }

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const labels = {
    dayStart: t('map.dayStart'),
    dayEnd: t('map.dayEnd'),
    unknown: t('map.unknown'),
  };

  const addNote = () => {
    if (!onAddNote || selectedSegments.length === 0) {
      return;
    }
    onAddNote(tripsToNotePrefill(selectedSegments, stopsById, labels));
    setSelectedIds(new Set());
  };

  return (
    <View testID="trip-list" style={styles.card}>
      {segments.map((segment, index) => {
        const {origin, destination} = tripEndpointNames(segment, stopsById, labels);
        const endpoints = `${origin} → ${destination}`;
        const time = `${formatTime(segment.start_ts)} – ${formatTime(segment.end_ts)}`;
        const stats = `${formatDistance(segment.distance_m)} · ${formatDuration(segment.duration_sec)}`;
        const selected = selectedIds.has(segment.id);
        return (
          <TouchableOpacity
            key={segment.id}
            accessibilityRole="button"
            accessibilityLabel={`${endpoints}, ${time}, ${stats}`}
            onPress={() => onPress(segment)}
            style={[
              styles.row,
              index === segments.length - 1 &&
                selectedSegments.length === 0 &&
                styles.lastRow,
            ]}>
            <View
              testID={`trip-swatch-${index}`}
              style={[
                styles.swatch,
                {
                  backgroundColor:
                    ROUTE_SEGMENT_COLORS[
                      index % ROUTE_SEGMENT_COLORS.length
                    ],
                },
              ]}
            />
            <View style={styles.details}>
              <Text style={styles.name}>{endpoints}</Text>
              <Text style={styles.time}>{time}</Text>
            </View>
            <Text style={styles.stats}>{stats}</Text>
            {onAddNote && (
              <TouchableOpacity
                testID={`trip-select-${index}`}
                accessibilityRole="checkbox"
                accessibilityState={{checked: selected}}
                accessibilityLabel={t('map.addTripToNote')}
                onPress={() => toggleSelected(segment.id)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                style={[styles.selectBtn, selected && styles.selectBtnActive]}>
                <Text style={[styles.selectBtnText, selected && styles.selectBtnTextActive]}>
                  {selected ? '✓' : '+'}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
      {selectedSegments.length > 0 && (
        <TouchableOpacity
          testID="trip-save-note"
          accessibilityRole="button"
          onPress={addNote}
          style={styles.footerBtn}>
          <Text style={styles.footerBtnText}>
            {t('map.saveTripsAsNote', {count: selectedSegments.length})}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function tripEndpointNames(
  segment: DayRouteSegment,
  stops: Map<number, DayRouteStop>,
  labels: {dayStart: string; dayEnd: string; unknown: string},
): {origin: string; destination: string} {
  return {
    origin: segment.origin_stop_id == null
      ? labels.dayStart
      : stops.get(segment.origin_stop_id)?.display_name ?? labels.unknown,
    destination: segment.destination_stop_id == null
      ? labels.dayEnd
      : stops.get(segment.destination_stop_id)?.display_name ?? labels.unknown,
  };
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    empty: {
      color: colors.textMuted,
      fontSize: typography.sizes.sm,
      marginLeft: spacing.xs,
    },
    card: {
      borderRadius: radius.lg,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    lastRow: {borderBottomWidth: 0},
    swatch: {width: 8, height: 36, borderRadius: radius.sm},
    details: {flex: 1},
    name: {
      color: colors.textPrimary,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
    time: {
      color: colors.textMuted,
      fontSize: typography.sizes.xs,
      marginTop: 2,
    },
    stats: {
      color: colors.textSecondary,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    },
    selectBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgMuted,
    },
    selectBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '20',
    },
    selectBtnText: {
      color: colors.textMuted,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
    selectBtnTextActive: {color: colors.primary},
    footerBtn: {
      alignItems: 'center',
      padding: spacing.md,
      backgroundColor: colors.primary + '15',
    },
    footerBtnText: {
      color: colors.primary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
  });
