import React, {useMemo} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';
import type {DayRouteSegment, TripMode} from '../../types';
import {formatDistance} from '../../screens/DayMapScreen';
import {formatDuration, formatTime} from '../../utils/dateUtils';
import {aggregateModeDurations} from '../../utils/tripModes';

interface TripDetailsModalProps {
  visible: boolean;
  segment: DayRouteSegment | null;
  originName: string;
  destinationName: string;
  onClose: () => void;
  onPressOrigin?: () => void;
  onPressDestination?: () => void;
}

/** m:ss per km; null under 200 m (too short to be a meaningful pace). */
export function formatPace(distanceM: number, durationSec: number): string | null {
  if (distanceM < 200) return null;
  const secPerKm = durationSec / (distanceM / 1000);
  const totalSeconds = Math.round(secPerKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

const MODE_LABEL_KEYS: Record<TripMode, string> = {
  vehicle: 'map.modeVehicle',
  foot: 'map.modeFoot',
  cycle: 'map.modeCycle',
  still: 'map.modeStill',
  unknown: 'map.modeUnknown',
};

function modesLine(
  t: (key: string) => string,
  spans: NonNullable<DayRouteSegment['mode_spans']>,
  durationSec: number,
): string | null {
  const totals = aggregateModeDurations(spans);
  const parts = (['vehicle', 'cycle', 'foot'] as TripMode[])
    .filter(mode => (totals[mode] ?? 0) > 0)
    .map(mode => `${t(MODE_LABEL_KEYS[mode])} ${formatDuration(Math.round(totals[mode] as number))}`);
  const unknown = totals.unknown ?? 0;
  if (unknown >= durationSec * 0.1) {
    parts.push(`${t(MODE_LABEL_KEYS.unknown)} ${formatDuration(Math.round(unknown))}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function TripDetailsModal({
  visible,
  segment,
  originName,
  destinationName,
  onClose,
  onPressOrigin,
  onPressDestination,
}: TripDetailsModalProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!segment) return null;
  const rows: Array<[string, string]> = [
    [t('dayMap.distance'), formatDistance(segment.distance_m)],
    [t('dayMap.duration'), formatDuration(segment.duration_sec)],
    [t('map.averageSpeed'), `${(segment.average_speed_mps * 3.6).toFixed(1)} km/h`],
    [t('map.maximumSpeed'), `${(segment.maximum_speed_mps * 3.6).toFixed(1)} km/h`],
  ];
  const pace = formatPace(segment.distance_m, segment.duration_sec);
  if (pace) rows.push([t('map.averagePace'), pace]);
  if (segment.still_seconds != null && segment.still_seconds > 0) {
    rows.push([t('map.notMoving'), formatDuration(Math.round(segment.still_seconds))]);
  }
  const modes = segment.mode_spans ? modesLine(t, segment.mode_spans, segment.duration_sec) : null;
  if (modes) rows.push([t('map.modes'), modes]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        testID="trip-details-backdrop"
        style={styles.backdrop}
        accessible={false}
        onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.eyebrow}>{t('map.tripDetails')}</Text>
          <Text style={styles.title}>
            <Text onPress={onPressOrigin} style={onPressOrigin ? styles.endpointTappable : undefined}>
              {originName}
            </Text>
            {' → '}
            <Text onPress={onPressDestination} style={onPressDestination ? styles.endpointTappable : undefined}>
              {destinationName}
            </Text>
          </Text>
          <Text style={styles.time}>
            {formatTime(segment.start_ts)} – {formatTime(segment.end_ts)}
          </Text>
          <View style={styles.rows}>
            {rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
          {segment.via && segment.via.length > 0 && (
            <View style={styles.via}>
              <Text style={styles.viaHeader}>{t('map.viaHeader')}</Text>
              {segment.via.map((item, index) => (
                <Text key={index} style={styles.viaRow}>
                  {item.kind === 'pause'
                    ? t('map.viaPause', {
                        duration: formatDuration(
                          Math.round((Date.parse(item.endTs) - Date.parse(item.startTs)) / 1000),
                        ),
                        name: item.name ?? t('map.viaUnnamed'),
                        time: formatTime(item.startTs),
                      })
                    : t('map.viaPassthrough', {name: item.name, time: formatTime(item.ts)})}
                </Text>
              ))}
            </View>
          )}
          <TouchableOpacity
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginTop: spacing.xs,
  },
  time: {color: colors.textMuted, marginTop: spacing.xs},
  endpointTappable: {textDecorationLine: 'underline'},
  rows: {marginTop: spacing.lg},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {color: colors.textSecondary},
  value: {color: colors.textPrimary, fontWeight: typography.weights.semibold},
  via: {marginTop: spacing.lg},
  viaHeader: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  viaRow: {color: colors.textSecondary, paddingVertical: spacing.xs},
  close: {
    backgroundColor: colors.bgMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  closeText: {
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: typography.weights.semibold,
  },
});
