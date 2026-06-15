import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getInsightsBreakdown, type InsightsData, type InsightSlice} from '../db/entries';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {formatHours} from '../utils/hoursUtils';

type Period = 'week' | 'month' | 'last30';

const PERIODS: {key: Period; label: string}[] = [
  {key: 'week', label: 'This week'},
  {key: 'month', label: 'This month'},
  {key: 'last30', label: 'Last 30 days'},
];

// Warm, slightly retro palette for the breakdown bars.
const PALETTE = ['#E8804D', '#E6A23C', '#D9646B', '#7B8CDE', '#5BA88F', '#C77DBB', '#B59B6A', '#8AA85B'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function rangeFor(period: Period): {start: string; end: string} {
  const now = new Date();
  const end = localDateStr(now);
  if (period === 'week') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return {start: localDateStr(monday), end};
  }
  if (period === 'month') {
    return {start: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end};
  }
  const back = new Date(now);
  back.setDate(now.getDate() - 29);
  return {start: localDateStr(back), end};
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {paddingBottom: spacing.xxl},
    periodRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.lg,
    },
    periodChip: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: c.bgMuted,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    periodChipActive: {borderColor: c.primary, backgroundColor: c.primary + '12'},
    periodChipText: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
    periodChipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    totalCard: {
      marginHorizontal: spacing.lg,
      padding: spacing.lg,
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    totalLabel: {fontSize: typography.sizes.sm, color: c.textMuted},
    totalValue: {fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: c.primary},
    sectionHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    barRow: {paddingHorizontal: spacing.lg, paddingVertical: spacing.sm},
    barTop: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
    barLabel: {fontSize: typography.sizes.sm, color: c.textPrimary, flex: 1},
    barValue: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.semibold},
    barTrack: {height: 8, borderRadius: 4, backgroundColor: c.bgMuted, overflow: 'hidden'},
    barFill: {height: 8, borderRadius: 4},
    empty: {padding: spacing.xxl, alignItems: 'center'},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
    loader: {marginTop: spacing.xxl},
  });

function Breakdown({title, slices, styles}: {title: string; slices: InsightSlice[]; styles: ReturnType<typeof makeStyles>}) {
  if (slices.length === 0) {
    return null;
  }
  const max = slices[0].seconds || 1;
  return (
    <>
      <Text style={styles.sectionHeader}>{title}</Text>
      {slices.map((s, i) => (
        <View key={s.key} style={styles.barRow}>
          <View style={styles.barTop}>
            <Text style={styles.barLabel} numberOfLines={1}>{s.label}</Text>
            <Text style={styles.barValue}>{formatHours(s.seconds)}</Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {width: `${Math.max(4, (s.seconds / max) * 100)}%`, backgroundColor: PALETTE[i % PALETTE.length]},
              ]}
            />
          </View>
        </View>
      ))}
    </>
  );
}

export default function InsightsScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const {start, end} = rangeFor(period);
    getInsightsBreakdown(start, end)
      .then(d => { if (!cancelled) { setData(d); } })
      .finally(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [period]);

  const hasData = data && data.totalSeconds > 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodChip, period === p.key && styles.periodChipActive]}
              onPress={() => setPeriod(p.key)}>
              <Text style={[styles.periodChipText, period === p.key && styles.periodChipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator style={styles.loader} color={colors.primary} />}

        {!loading && !hasData && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tracked time in this period yet.</Text>
          </View>
        )}

        {!loading && hasData && (
          <>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total tracked</Text>
              <Text style={styles.totalValue}>{formatHours(data!.totalSeconds)}</Text>
            </View>
            <Breakdown title="By activity" slices={data!.byActivity} styles={styles} />
            <Breakdown title="By project" slices={data!.byProject} styles={styles} />
            <Breakdown title="By tag" slices={data!.byTag} styles={styles} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
