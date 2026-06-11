import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, typography, spacing, radius} from '../../theme';
import type {HourBreakdown as HourBreakdownData} from '../../utils/hoursUtils';
import {formatHours} from '../../utils/hoursUtils';

interface Props {
  data: HourBreakdownData;
}

export default function HourBreakdown({data}: Props) {
  const total = data.totalTrackedSeconds;

  if (total === 0) {
    return (
      <View style={styles.emptyBar}>
        <Text style={styles.emptyText}>No time tracked yet</Text>
      </View>
    );
  }

  const workPct = (data.workSeconds / total) * 100;
  const pwPct = (data.personalWorkSeconds / total) * 100;
  const persPct = (data.personalSeconds / total) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {workPct > 0 && (
          <View style={[styles.segment, styles.work, {flex: workPct}]} />
        )}
        {pwPct > 0 && (
          <View style={[styles.segment, styles.personalWork, {flex: pwPct}]} />
        )}
        {persPct > 0 && (
          <View style={[styles.segment, styles.personal, {flex: persPct}]} />
        )}
      </View>
      <View style={styles.legend}>
        {data.workSeconds > 0 && (
          <LegendItem
            color={colors.badgeWork}
            label="Work"
            value={formatHours(data.workSeconds)}
          />
        )}
        {data.personalWorkSeconds > 0 && (
          <LegendItem
            color={colors.badgePersonalWork}
            label="Personal (work)"
            value={formatHours(data.personalWorkSeconds)}
          />
        )}
        {data.personalSeconds > 0 && (
          <LegendItem
            color={colors.badgePersonal}
            label="Personal"
            value={formatHours(data.personalSeconds)}
          />
        )}
      </View>
    </View>
  );
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: spacing.sm},
  bar: {
    height: 10,
    borderRadius: radius.pill,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.bgMuted,
  },
  segment: {
    height: '100%',
  },
  work: {backgroundColor: colors.badgeWork},
  personalWork: {backgroundColor: colors.badgePersonalWork},
  personal: {backgroundColor: colors.badgePersonal},
  emptyBar: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  legendValue: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
