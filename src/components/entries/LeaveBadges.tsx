import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {LeaveRange} from '../../types';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';

const KEYS = {
  paid_day_off: 'leave.paidDayOff',
  unpaid_day_off: 'leave.unpaidDayOff',
  vacation: 'leave.vacation',
  sick: 'leave.sick',
} as const;

const SHORT_KEYS = {
  paid_day_off: 'leave.paidShort',
  unpaid_day_off: 'leave.unpaidShort',
  vacation: 'leave.vacationShort',
  sick: 'leave.sickShort',
} as const;

const makeStyles = (colors: Colors) => StyleSheet.create({
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accentPink + '20',
    borderWidth: 1,
    borderColor: colors.accentPink,
  },
  compact: {paddingHorizontal: 4, paddingVertical: 1},
  text: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});

export default function LeaveBadges({
  ranges,
  compact = false,
  onPress,
}: {
  ranges: LeaveRange[];
  compact?: boolean;
  onPress?: (range: LeaveRange) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (ranges.length === 0) { return null; }
  return (
    <View style={styles.row}>
      {ranges.map(range => (
        <TouchableOpacity
          key={range.id}
          style={[styles.badge, compact && styles.compact]}
          onPress={onPress ? () => onPress(range) : undefined}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityLabel={t(KEYS[range.type])}>
          <Text style={styles.text}>
            {t(compact ? SHORT_KEYS[range.type] : KEYS[range.type])}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
