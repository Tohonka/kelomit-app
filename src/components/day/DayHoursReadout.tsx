import React, {useMemo} from 'react';
import {View, Text, StyleSheet, type ViewStyle} from 'react-native';
import {useTheme, typography} from '../../theme';
import type {Colors} from '../../theme';
import CountUp from '../ui/CountUp';
import Bounceable from '../ui/Bounceable';
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
  /** Tap target (opens the day-details sheet). */
  onPress?: () => void;
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

/** Top-right hours readout of the day header. One big work number, or — when
 *  the personal line is enabled — work over personal in a column. */
export default function DayHoursReadout({workSecs, personalSecs, showPersonal, style, onPress}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (workSecs <= 0 && (!showPersonal || personalSecs <= 0)) { return null; }

  const body = showPersonal ? (
    <>
      <CountUp value={workSecs} style={styles.primary} format={formatHours} />
      <Text style={styles.secondary}>{formatHours(personalSecs)}</Text>
    </>
  ) : (
    <CountUp value={workSecs} style={styles.single} format={formatHours} />
  );

  return onPress ? (
    <Bounceable onPress={onPress} style={[styles.container, style]} hitSlop={8}>{body}</Bounceable>
  ) : (
    <View style={[styles.container, style]}>{body}</View>
  );
}
