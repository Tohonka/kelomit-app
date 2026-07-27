import React, {useMemo} from 'react';
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

export default function TripList({
  segments,
  stops,
  onPress,
}: {
  segments: DayRouteSegment[];
  stops: DayRouteStop[];
  onPress: (segment: DayRouteSegment) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stopsById = useMemo(
    () => new Map(stops.map(stop => [stop.id, stop])),
    [stops],
  );

  if (segments.length === 0) {
    return <Text style={styles.empty}>{t('dayMap.empty')}</Text>;
  }

  return (
    <View testID="trip-list" style={styles.card}>
      {segments.map((segment, index) => {
        const {origin, destination} = tripEndpointNames(segment, stopsById, {
          dayStart: t('map.dayStart'),
          dayEnd: t('map.dayEnd'),
          unknown: t('map.unknown'),
        });
        const endpoints = `${origin} → ${destination}`;
        const time = `${formatTime(segment.start_ts)} – ${formatTime(segment.end_ts)}`;
        const stats = `${formatDistance(segment.distance_m)} · ${formatDuration(segment.duration_sec)}`;
        return (
          <TouchableOpacity
            key={segment.id}
            accessibilityRole="button"
            accessibilityLabel={`${endpoints}, ${time}, ${stats}`}
            onPress={() => onPress(segment)}
            style={[
              styles.row,
              index === segments.length - 1 && styles.lastRow,
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
          </TouchableOpacity>
        );
      })}
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
  });
