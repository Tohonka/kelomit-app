import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {chartColorAt} from '../../utils/chartColors';
import {entryTrackedSeconds, formatHours} from '../../utils/hoursUtils';
import type {Entry} from '../../types';

interface Props {
  entries: Entry[];
}

/** Stacked per-project bar. Lives inside DayDetailsSheet (no card chrome of its own). */
const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {gap: spacing.sm},
    bar: {flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.bgMuted},
    legend: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    legendItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
    dot: {width: 8, height: 8, borderRadius: 4},
    legendText: {fontSize: typography.sizes.xs, color: c.textSecondary},
  });

export default function DaySplitBar({entries}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slices = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      // Same accounting as calcHourBreakdown: subnotes ride inside their parent.
      if (e.parent_id != null) { continue; }
      const secs = entryTrackedSeconds(e);
      if (secs <= 0) { continue; }
      const key = e.project?.name ?? t('insights.noProject');
      map.set(key, (map.get(key) ?? 0) + secs);
    }
    return [...map.entries()]
      .map(([label, seconds]) => ({label, seconds}))
      .sort((a, b) => b.seconds - a.seconds);
  }, [entries, t]);

  const total = slices.reduce((sum, s) => sum + s.seconds, 0);
  if (total <= 0) {
    return null;
  }

  return (
    <View style={styles.container}>
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
