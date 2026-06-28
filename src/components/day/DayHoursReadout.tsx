import React, {useMemo} from 'react';
import {View, Text, StyleSheet, type ViewStyle} from 'react-native';
import {useTheme, typography} from '../../theme';
import type {Colors} from '../../theme';
import CountUp from '../ui/CountUp';
import {formatHours} from '../../utils/hoursUtils';

interface Props {
  /** Primary (work-day) seconds. */
  workSecs: number;
  /** Secondary (purely-personal) seconds. */
  personalSecs: number;
  /** Show the secondary personal line under the work total. */
  showPersonal: boolean;
  /** Extra container style (e.g. nav-header right margin). */
  style?: ViewStyle;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {alignItems: 'flex-end'},
    // Single-value mode: bigger, taking ~two rows of height.
    single: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: c.primary,
    },
    primary: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: c.primary,
      lineHeight: typography.sizes.lg + 2,
    },
    secondary: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.badgePersonal,
      lineHeight: typography.sizes.sm + 2,
    },
  });

/** Top-right hours readout shared by Home and Day. One big work number, or —
 *  when the personal line is enabled — work over personal in a column. */
export default function DayHoursReadout({workSecs, personalSecs, showPersonal, style}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!showPersonal) {
    if (workSecs <= 0) { return null; }
    return (
      <View style={[styles.container, style]}>
        <CountUp value={workSecs} style={styles.single} format={formatHours} />
      </View>
    );
  }

  if (workSecs <= 0 && personalSecs <= 0) { return null; }
  return (
    <View style={[styles.container, style]}>
      <CountUp value={workSecs} style={styles.primary} format={formatHours} />
      <Text style={styles.secondary}>{formatHours(personalSecs)}</Text>
    </View>
  );
}
