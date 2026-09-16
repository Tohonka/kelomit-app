import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

export interface DayBar {
  key: string;
  label: string;
  value: number;
  isToday?: boolean;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: 14,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    col: {alignItems: 'center', flex: 1, gap: 6},
    track: {justifyContent: 'flex-end', width: 22},
    bar: {width: '100%', borderRadius: 5, minHeight: 4},
    label: {fontSize: 11, color: c.textMuted},
    labelToday: {color: c.primary, fontWeight: typography.weights.bold},
  });

/** One bar per day, scaled to the tallest (or a given ceiling). Same look as
 *  the Insights daily-hours bars, reused for kcal, steps and walking minutes. */
export default function DayBars({
  days,
  color,
  ceiling,
  height = 100,
}: {
  days: DayBar[];
  color: string;
  /** Value that fills the track; defaults to the tallest bar. */
  ceiling?: number;
  height?: number;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const max = ceiling ?? Math.max(1, ...days.map(d => d.value));
  return (
    <View style={styles.card}>
      {days.map(d => {
        const px = Math.max(d.value > 0 ? 4 : 0, Math.min(1, d.value / max) * height);
        return (
          <View key={d.key} style={styles.col}>
            <View style={[styles.track, {height}]}>
              <View style={[styles.bar, {height: px, backgroundColor: d.value > 0 ? color : colors.bgMuted}]} />
            </View>
            <Text style={[styles.label, d.isToday && styles.labelToday]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
