import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import Sheet from '../ui/Sheet';
import HourBreakdown from './HourBreakdown';
import DaySplitBar from './DaySplitBar';
import {calcHourBreakdown, calcDayWorkBreakdown, formatHours} from '../../utils/hoursUtils';
import type {Day, Entry} from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  day: Day;
  entries: Entry[];
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    body: {paddingHorizontal: spacing.lg, gap: spacing.md},
    workedRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    workedLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textSecondary,
    },
    workedValue: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: c.badgeWork,
    },
    adjLine: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: -spacing.sm},
    sectionLabel: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.sm,
    },
  });

/** Everything the day card no longer shows inline: the worked total with its
 *  after-hours/personal adjustments, the labelled activity legend, and the
 *  per-project split. Opened from the header readout or the card's hours row. */
export default function DayDetailsSheet({visible, onClose, day, entries}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const breakdown = calcHourBreakdown(entries);
  const dayWork = calcDayWorkBreakdown(day, entries);
  const adjustments: string[] = [];
  if (dayWork.addedWorkSeconds > 0) {
    adjustments.push(`+${formatHours(dayWork.addedWorkSeconds)} ${t('time.adjAfterHours')}`);
  }
  if (dayWork.deductedPersonalSeconds > 0) {
    adjustments.push(`−${formatHours(dayWork.deductedPersonalSeconds)} ${t('time.adjPersonal')}`);
  }

  return (
    <Sheet visible={visible} title={t('day.detailsTitle')} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.workedRow}>
          <Text style={styles.workedLabel}>{t('time.worked')}</Text>
          <Text style={styles.workedValue}>{formatHours(dayWork.workSeconds)}</Text>
        </View>
        {adjustments.length > 0 && <Text style={styles.adjLine}>{adjustments.join('  ·  ')}</Text>}
        <HourBreakdown data={breakdown} />
        {breakdown.totalTrackedSeconds > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t('day.projectSplit')}</Text>
            <DaySplitBar entries={entries} />
          </>
        )}
      </View>
    </Sheet>
  );
}
