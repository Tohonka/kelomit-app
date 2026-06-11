import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, typography, spacing} from '../../theme';
import Card from '../ui/Card';
import TimePicker from '../ui/TimePicker';
import HourBreakdown from './HourBreakdown';
import {calcHourBreakdown, formatHours} from '../../utils/hoursUtils';
import type {Entry} from '../../types';
import type {Day} from '../../types';

interface Props {
  day: Day;
  entries: Entry[];
  onChangeStarted: (iso: string) => void;
  onChangeEnded: (iso: string) => void;
}

export default function DaySummaryCard({
  day,
  entries,
  onChangeStarted,
  onChangeEnded,
}: Props) {
  const breakdown = calcHourBreakdown(entries);

  return (
    <Card style={styles.card} >
      <View style={styles.row}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Started</Text>
          <TimePicker
            value={day.started_at}
            placeholder="–:––"
            onChange={onChangeStarted}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Ended</Text>
          <TimePicker
            value={day.ended_at}
            placeholder="–:––"
            onChange={onChangeEnded}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.hoursBlock}>
          <Text style={styles.timeLabel}>Work hours</Text>
          <Text style={styles.hoursValue}>
            {formatHours(breakdown.workSeconds)}
          </Text>
        </View>
      </View>

      <View style={styles.barWrapper}>
        <HourBreakdown data={breakdown} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  hoursBlock: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  divider: {
    width: 1,
    height: 52,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    alignSelf: 'center',
  },
  timeLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hoursValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  barWrapper: {
    marginTop: spacing.xs,
  },
});
