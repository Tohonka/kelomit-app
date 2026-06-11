import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {ActivityType} from '../../types';

const LABELS: Record<ActivityType, string> = {
  work: 'Work',
  personal_work: 'Personal (work)',
  personal: 'Personal',
};

interface Props {
  type: ActivityType;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    work: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.badgeWork,
    },
    personal_work: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.badgePersonalWork,
    },
    personal: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.badgePersonal,
    },
    label: {
      color: '#fff',
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    },
  });

export default function ActivityBadge({type}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles[type]}>
      <Text style={styles.label}>{LABELS[type]}</Text>
    </View>
  );
}
