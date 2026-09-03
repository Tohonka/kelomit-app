import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {HourBreakdown as HourBreakdownData} from '../../utils/hoursUtils';
import {formatHours} from '../../utils/hoursUtils';

interface Props {
  data: HourBreakdownData;
  /** Bar + dot·value legend only (no labels) — the one-line row on the day card. */
  compact?: boolean;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {gap: spacing.sm},
    bar: {
      height: 10,
      borderRadius: radius.pill,
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: c.bgMuted,
    },
    segment: {height: '100%'},
    work: {backgroundColor: c.badgeWork},
    personalWork: {backgroundColor: c.badgePersonalWork},
    personal: {backgroundColor: c.badgePersonal},
    emptyBar: {
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: c.bgMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {fontSize: typography.sizes.xs, color: c.textMuted},
    legend: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md},
    legendItem: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
    dot: {width: 8, height: 8, borderRadius: 4},
    legendLabel: {fontSize: typography.sizes.xs, color: c.textSecondary},
    legendValue: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
  });

function LegendItem({color, label, value}: {color: string; label: string; value: string}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      {label ? <Text style={styles.legendLabel}>{label}</Text> : null}
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

export default function HourBreakdown({data, compact}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const total = data.totalTrackedSeconds;
  const label = (key: string) => (compact ? '' : t(key));

  if (total === 0) {
    return (
      <View style={styles.emptyBar}>
        <Text style={styles.emptyText}>{t('time.noTimeTracked')}</Text>
      </View>
    );
  }

  const workPct = (data.workSeconds / total) * 100;
  const pwPct = (data.personalWorkSeconds / total) * 100;
  const persPct = (data.personalSeconds / total) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        {workPct > 0 && <View style={[styles.segment, styles.work, {flex: workPct}]} />}
        {pwPct > 0 && <View style={[styles.segment, styles.personalWork, {flex: pwPct}]} />}
        {persPct > 0 && <View style={[styles.segment, styles.personal, {flex: persPct}]} />}
      </View>
      <View style={styles.legend}>
        {data.workSeconds > 0 && (
          <LegendItem color={colors.badgeWork} label={label('activity.work')} value={formatHours(data.workSeconds)} />
        )}
        {data.personalWorkSeconds > 0 && (
          <LegendItem
            color={colors.badgePersonalWork}
            label={label('activity.personal_work')}
            value={formatHours(data.personalWorkSeconds)}
          />
        )}
        {data.personalSeconds > 0 && (
          <LegendItem
            color={colors.badgePersonal}
            label={label('activity.personal')}
            value={formatHours(data.personalSeconds)}
          />
        )}
      </View>
    </View>
  );
}
