import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from 'date-fns';
import {colors, typography, spacing, radius} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';

type CalendarView = 'month' | 'week';
type Props = TabScreenProps<'Calendar'>;

export default function CalendarScreen({navigation}: Props) {
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const navigateToDay = (date: Date) => {
    navigation.navigate('DayScreen', {date: format(date, 'yyyy-MM-dd')});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            setCurrentDate(
              d => new Date(d.getFullYear(), d.getMonth() - 1, 1),
            )
          }
          style={styles.navBtn}>
          <Text style={styles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity
          onPress={() =>
            setCurrentDate(
              d => new Date(d.getFullYear(), d.getMonth() + 1, 1),
            )
          }
          style={styles.navBtn}>
          <Text style={styles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        {(['month', 'week'] as CalendarView[]).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.segment,
              viewMode === mode && styles.segmentActive,
            ]}
            onPress={() => setViewMode(mode)}>
            <Text
              style={[
                styles.segmentText,
                viewMode === mode && styles.segmentTextActive,
              ]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView>
        {viewMode === 'month' ? (
          <MonthGrid
            currentDate={currentDate}
            onDayPress={navigateToDay}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            onDayPress={navigateToDay}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MonthGrid({
  currentDate,
  onDayPress,
}: {
  currentDate: Date;
  onDayPress: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, {weekStartsOn: 1});
  const gridEnd = endOfWeek(monthEnd, {weekStartsOn: 1});
  const days = eachDayOfInterval({start: gridStart, end: gridEnd});

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <View style={gridStyles.container}>
      <View style={gridStyles.weekdayRow}>
        {weekdays.map(d => (
          <Text key={d} style={gridStyles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      <View style={gridStyles.grid}>
        {days.map(d => {
          const inMonth = isSameMonth(d, currentDate);
          const today = isToday(d);
          return (
            <TouchableOpacity
              key={d.toISOString()}
              style={[
                gridStyles.cell,
                !inMonth && gridStyles.cellOutside,
                today && gridStyles.cellToday,
              ]}
              onPress={() => onDayPress(d)}
              activeOpacity={0.7}>
              <Text
                style={[
                  gridStyles.dayNum,
                  !inMonth && gridStyles.dayNumOutside,
                  today && gridStyles.dayNumToday,
                ]}>
                {format(d, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function WeekView({
  currentDate,
  onDayPress,
}: {
  currentDate: Date;
  onDayPress: (d: Date) => void;
}) {
  const weekStart = startOfWeek(currentDate, {weekStartsOn: 1});
  const weekEnd = endOfWeek(currentDate, {weekStartsOn: 1});
  const days = eachDayOfInterval({start: weekStart, end: weekEnd});

  return (
    <View style={weekStyles.row}>
      {days.map(d => {
        const today = isToday(d);
        return (
          <TouchableOpacity
            key={d.toISOString()}
            style={[weekStyles.cell, today && weekStyles.cellToday]}
            onPress={() => onDayPress(d)}
            activeOpacity={0.7}>
            <Text style={weekStyles.dayName}>{format(d, 'EEE')}</Text>
            <Text
              style={[weekStyles.dayNum, today && weekStyles.dayNumToday]}>
              {format(d, 'd')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  monthLabel: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  navBtn: {
    padding: spacing.sm,
  },
  navBtnText: {
    fontSize: typography.sizes.xl,
    color: colors.primary,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.bgMuted,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.bgCard,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  segmentText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
  },
});

const gridStyles = StyleSheet.create({
  container: {paddingHorizontal: spacing.sm},
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  cellOutside: {opacity: 0.3},
  cellToday: {backgroundColor: colors.primary + '20'},
  dayNum: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  dayNumOutside: {color: colors.textMuted},
  dayNumToday: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
});

const weekStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cellToday: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  dayName: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
  },
  dayNum: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  dayNumToday: {color: colors.primary},
});
