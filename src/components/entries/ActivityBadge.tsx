import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, typography, spacing, radius} from '../../theme';
import type {ActivityType} from '../../types';

const LABELS: Record<ActivityType, string> = {
  work: 'Work',
  personal_work: 'Personal (work)',
  personal: 'Personal',
};

const BG: Record<ActivityType, string> = {
  work: colors.badgeWork,
  personal_work: colors.badgePersonalWork,
  personal: colors.badgePersonal,
};

interface Props {
  type: ActivityType;
}

export default function ActivityBadge({type}: Props) {
  return (
    <View style={[styles.badge, {backgroundColor: BG[type]}]}>
      <Text style={styles.label}>{LABELS[type]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  label: {
    color: '#fff',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
