import React, {useMemo} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {useHabitStore, effectiveDone, overrideOf} from '../../store/habitStore';
import {monthGrid} from '../../utils/habitMonth';
import {todayDate} from '../../utils/dateUtils';
import {useTheme, typography} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  habitId: number;
  month: string;
}

const DOT = 18;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    grid: {flexDirection: 'row', flexWrap: 'wrap'},
    cellPressed: {opacity: 0.6},
    cell: {width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3},
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotDone: {backgroundColor: c.primary},
    // Auto-matched: ring, so the eye can tell "earned" from "ticked".
    dotAuto: {backgroundColor: 'transparent', borderWidth: 2.5, borderColor: c.primary},
    dotFuture: {opacity: 0.3},
    dotToday: {borderWidth: 1.5, borderColor: c.accent},
    dayNum: {fontSize: 8, color: c.textMuted, fontWeight: typography.weights.medium},
    dayNumDone: {color: c.white},
    dayNumAuto: {color: c.primary},
  });

export default function HabitMatrix({habitId, month}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const overrides = useHabitStore(s => s.overrides);
  const auto = useHabitStore(s => s.auto);
  const toggleDay = useHabitStore(s => s.toggleDay);
  const clearOverride = useHabitStore(s => s.clearOverride);
  const cells = useMemo(() => monthGrid(month), [month]);
  const today = todayDate();
  const view = {overrides, auto};

  return (
    <View style={styles.grid}>
      {cells.map((date, i) => {
        if (!date) { return <View key={`b${i}`} style={styles.cell} />; }
        const future = date > today;
        const done = effectiveDone(view, habitId, date);
        const manual = overrideOf(view, habitId, date) !== undefined;
        const autoStyle = done && !manual;
        return (
          <Pressable
            key={date}
            style={({pressed}) => [styles.cell, pressed && styles.cellPressed]}
            disabled={future}
            onPress={() => toggleDay(habitId, date)}
            onLongPress={() => clearOverride(habitId, date)}
            hitSlop={4}>
            <View
              style={[
                styles.dot,
                done && (autoStyle ? styles.dotAuto : styles.dotDone),
                future && styles.dotFuture,
                date === today && !done && styles.dotToday,
              ]}>
              <Text style={[styles.dayNum, done && (autoStyle ? styles.dayNumAuto : styles.dayNumDone)]}>
                {Number(date.slice(-2))}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
