import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {chartColorAt} from '../../utils/chartColors';
import {formatHours} from '../../utils/hoursUtils';
import type {Entry} from '../../types';

interface Props {
  entries: Entry[];
}

function entrySeconds(e: Entry): number {
  if (e.duration_sec != null) { return e.duration_sec; }
  if (e.time_from && e.time_to) {
    const s = (new Date(e.time_to).getTime() - new Date(e.time_from).getTime()) / 1000;
    return s > 0 ? s : 0;
  }
  return 0;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      gap: spacing.sm,
    },
    bar: {flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.bgMuted},
    legend: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
    dot: {width: 8, height: 8, borderRadius: 4},
    legendText: {fontSize: typography.sizes.xs, color: c.textSecondary},
  });

export default function DaySplitBar({entries}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slices = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const secs = entrySeconds(e);
      if (secs <= 0) { continue; }
      const key = e.project?.name ?? 'No project';
      map.set(key, (map.get(key) ?? 0) + secs);
    }
    return [...map.entries()]
      .map(([label, seconds]) => ({label, seconds}))
      .sort((a, b) => b.seconds - a.seconds);
  }, [entries]);

  const total = slices.reduce((sum, s) => sum + s.seconds, 0);
  if (total <= 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.bar}>
        {slices.map((s, i) => (
          <View key={s.label} style={{flex: s.seconds, backgroundColor: chartColorAt(i)}} />
        ))}
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, {backgroundColor: chartColorAt(i)}]} />
            <Text style={styles.legendText}>{s.label} · {formatHours(s.seconds)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
