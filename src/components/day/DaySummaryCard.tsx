import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import Card from '../ui/Card';
import TimePicker from '../ui/TimePicker';
import HourBreakdown from './HourBreakdown';
import {calcHourBreakdown} from '../../utils/hoursUtils';
import type {Entry, Day} from '../../types';

interface Props {
  day: Day;
  entries: Entry[];
  onUpdateTimes: (fields: Partial<Pick<Day,
    'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2'
  >>) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.md},
    legRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    arrow: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      marginHorizontal: 2,
    },
    legSpacer: {flex: 1},
    addBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary + '18',
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: {
      color: c.primary,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '400',
    },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeBtnText: {
      color: c.textMuted,
      fontSize: 16,
      lineHeight: 20,
    },
    separator: {
      height: 1,
      backgroundColor: c.border,
    },
  });

export default function DaySummaryCard({day, entries, onUpdateTimes}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showLeg2, setShowLeg2] = useState(
    !!(day.started_at_2 || day.ended_at_2),
  );

  const breakdown = calcHourBreakdown(entries);

  const addLeg2 = () => setShowLeg2(true);
  const removeLeg2 = () => {
    setShowLeg2(false);
    onUpdateTimes({started_at_2: null, ended_at_2: null});
  };

  return (
    <Card style={styles.card}>
      {/* Leg 1 */}
      <View style={styles.legRow}>
        <TimePicker
          value={day.started_at}
          placeholder="Start"
          onChange={iso => onUpdateTimes({started_at: iso})}
        />
        <Text style={styles.arrow}>→</Text>
        <TimePicker
          value={day.ended_at}
          placeholder="End"
          onChange={iso => onUpdateTimes({ended_at: iso})}
        />
        <View style={styles.legSpacer} />
        {!showLeg2 && (
          <TouchableOpacity style={styles.addBtn} onPress={addLeg2}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leg 2 */}
      {showLeg2 && (
        <View style={styles.legRow}>
          <TimePicker
            value={day.started_at_2}
            placeholder="Start"
            onChange={iso => onUpdateTimes({started_at_2: iso})}
          />
          <Text style={styles.arrow}>→</Text>
          <TimePicker
            value={day.ended_at_2}
            placeholder="End"
            onChange={iso => onUpdateTimes({ended_at_2: iso})}
          />
          <View style={styles.legSpacer} />
          <TouchableOpacity style={styles.removeBtn} onPress={removeLeg2}>
            <Text style={styles.removeBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {breakdown.totalTrackedSeconds > 0 && (
        <>
          <View style={styles.separator} />
          <HourBreakdown data={breakdown} />
        </>
      )}
    </Card>
  );
}
