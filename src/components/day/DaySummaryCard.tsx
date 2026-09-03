import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import Card from '../ui/Card';
import Bounceable from '../ui/Bounceable';
import TimePicker from '../ui/TimePicker';
import HourBreakdown from './HourBreakdown';
import {calcHourBreakdown, segmentWorkSecs, formatHours} from '../../utils/hoursUtils';
import type {Entry, Day} from '../../types';

interface Props {
  day: Day;
  entries: Entry[];
  onUpdateTimes: (fields: Partial<Pick<Day,
    'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2'
  >>) => void;
  /** Tap on the hours row → DayDetailsSheet (worked total, legend, project split). */
  onOpenDetails: () => void;
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
    legHours: {
      flex: 1,
      textAlign: 'right',
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      marginRight: spacing.xs,
    },
    legHoursActive: {color: c.badgeWork},
    legHoursEmpty: {color: c.textMuted},
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
    hoursRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    hoursBar: {flex: 1},
  });

export default function DaySummaryCard({day, entries, onUpdateTimes, onOpenDetails}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showLeg2, setShowLeg2] = useState(
    !!(day.started_at_2 || day.ended_at_2),
  );

  // Re-sync when the day itself changes (e.g. midnight rollover swaps in a fresh
  // day): otherwise the leg-2 row stays visible from yesterday on the new day.
  useEffect(() => {
    setShowLeg2(!!(day.started_at_2 || day.ended_at_2));
  }, [day.id, day.started_at_2, day.ended_at_2]);

  const breakdown = calcHourBreakdown(entries);

  const seg1Secs = segmentWorkSecs(day.started_at, day.ended_at);
  const seg2Secs = segmentWorkSecs(day.started_at_2, day.ended_at_2);
  const seg1HasInput = !!(day.started_at || day.ended_at);
  const seg2HasInput = !!(day.started_at_2 || day.ended_at_2);

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
          baseDate={day.date}
          placeholder={t('time.start')}
          onChange={iso => onUpdateTimes({started_at: iso})}
        />
        <Text style={styles.arrow}>→</Text>
        <TimePicker
          value={day.ended_at}
          baseDate={day.date}
          placeholder={t('time.end')}
          onChange={iso => onUpdateTimes({ended_at: iso})}
        />
        <Text
          style={[
            styles.legHours,
            seg1Secs > 0 ? styles.legHoursActive : styles.legHoursEmpty,
          ]}>
          {seg1Secs > 0 ? formatHours(seg1Secs) : seg1HasInput ? '—' : ''}
        </Text>
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
            baseDate={day.date}
            placeholder={t('time.start')}
            onChange={iso => onUpdateTimes({started_at_2: iso})}
          />
          <Text style={styles.arrow}>→</Text>
          <TimePicker
            value={day.ended_at_2}
            baseDate={day.date}
            placeholder={t('time.end')}
            onChange={iso => onUpdateTimes({ended_at_2: iso})}
          />
          <Text
            style={[
              styles.legHours,
              seg2Secs > 0 ? styles.legHoursActive : styles.legHoursEmpty,
            ]}>
            {seg2Secs > 0 ? formatHours(seg2Secs) : seg2HasInput ? '—' : ''}
          </Text>
          <TouchableOpacity style={styles.removeBtn} onPress={removeLeg2}>
            <Text style={styles.removeBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* One compact hours row; everything else (worked total, adjustments,
          labelled legend, project split) lives in DayDetailsSheet. */}
      {breakdown.totalTrackedSeconds > 0 && (
        <>
          <View style={styles.separator} />
          <Bounceable onPress={onOpenDetails} style={styles.hoursRow}>
            <View style={styles.hoursBar}>
              <HourBreakdown data={breakdown} compact />
            </View>
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </Bounceable>
        </>
      )}
    </Card>
  );
}
