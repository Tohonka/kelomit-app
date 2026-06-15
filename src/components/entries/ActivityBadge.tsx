import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {ActivityType} from '../../types';

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
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles[type]}>
      <Text style={styles.label}>{t(`activity.${type}`)}</Text>
    </View>
  );
}
