import React, {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
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
}: {
  segments: DayRouteSegment[];
  stops: DayRouteStop[];
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
        const origin =
          segment.origin_stop_id == null
            ? t('map.dayStart')
            : stopsById.get(segment.origin_stop_id)?.display_name ??
              t('map.unknown');
        const destination =
          segment.destination_stop_id == null
            ? t('map.dayEnd')
            : stopsById.get(segment.destination_stop_id)?.display_name ??
              t('map.unknown');
        return (
          <View
            key={segment.id}
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
              <Text style={styles.name}>
                {origin} → {destination}
              </Text>
              <Text style={styles.time}>
                {formatTime(segment.start_ts)} – {formatTime(segment.end_ts)}
              </Text>
            </View>
            <Text style={styles.stats}>
              {formatDistance(segment.distance_m)} ·{' '}
              {formatDuration(segment.duration_sec)}
            </Text>
          </View>
        );
      })}
    </View>
  );
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
