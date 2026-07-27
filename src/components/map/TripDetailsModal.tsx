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
import type {DayRouteSegment} from '../../types';
import {formatDistance} from '../../screens/DayMapScreen';
import {formatDuration, formatTime} from '../../utils/dateUtils';

interface TripDetailsModalProps {
  visible: boolean;
  segment: DayRouteSegment | null;
  originName: string;
  destinationName: string;
  onClose: () => void;
}

export default function TripDetailsModal({
  visible,
  segment,
  originName,
  destinationName,
  onClose,
}: TripDetailsModalProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!segment) return null;
  const rows = [
    [t('dayMap.distance'), formatDistance(segment.distance_m)],
    [t('dayMap.duration'), formatDuration(segment.duration_sec)],
    [t('map.averageSpeed'), `${(segment.average_speed_mps * 3.6).toFixed(1)} km/h`],
    [t('map.maximumSpeed'), `${(segment.maximum_speed_mps * 3.6).toFixed(1)} km/h`],
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        testID="trip-details-backdrop"
        style={styles.backdrop}
        accessible={false}
        onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.eyebrow}>{t('map.tripDetails')}</Text>
          <Text style={styles.title}>{originName} → {destinationName}</Text>
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
