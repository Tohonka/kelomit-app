import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  PanResponder,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {format, eachDayOfInterval, isToday, getISOWeek, subDays} from 'date-fns';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {useSettingsStore} from '../store/settingsStore';
import {getWorkSecondsByDay} from '../db/entries';
import {formatHours} from '../utils/hoursUtils';
import type {TabScreenProps} from '../navigation/navigationTypes';

type CalendarView = 'month' | 'week' | 'range';
type Props = TabScreenProps<'Calendar'>;

// ─── Reliable date helpers (avoids date-fns startOfWeek timezone issues) ───

/** Returns 0=Mon … 6=Sun */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDaysToDate(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthGridDays(date: Date): Date[] {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridStart = addDaysToDate(monthStart, -mondayIndex(monthStart));
  const gridEnd = addDaysToDate(monthEnd, 6 - mondayIndex(monthEnd));
  return eachDayOfInterval({start: gridStart, end: gridEnd});
}

function getWeekDays(date: Date): Date[] {
  const monday = addDaysToDate(date, -mondayIndex(date));
  return Array.from({length: 7}, (_, i) => addDaysToDate(monday, i));
}

function isSameMonth(d: Date, ref: Date): boolean {
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

// ─── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    periodLabel: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    navBtn: {padding: spacing.sm, minWidth: 36},
    navBtnText: {fontSize: typography.sizes.xl, color: c.primary},
    segmentRow: {
      flexDirection: 'row',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      padding: 3,
    },
    segment: {flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center'},
    segmentActive: {
      backgroundColor: c.bgCard,
      shadowColor: c.shadow,
      shadowOpacity: 0.06,
      shadowOffset: {width: 0, height: 1},
      elevation: 1,
    },
    segmentText: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
    segmentTextActive: {color: c.textPrimary, fontWeight: typography.weights.semibold},
    rangePickers: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    rangeDateBtn: {
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    rangeDateLabel: {fontSize: typography.sizes.xs, color: c.textMuted, fontWeight: typography.weights.medium, marginBottom: 2},
    rangeDateValue: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.semibold},
    rangeSep: {fontSize: typography.sizes.base, color: c.textMuted},
    summaryBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    summaryLabel: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
    summaryValue: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.primary},
    flex: {flex: 1},
  });

export default function CalendarScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {show_week_numbers} = useSettingsStore();
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hoursMap, setHoursMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<Date>(() => subDays(new Date(), 6));
  const [rangeTo, setRangeTo] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const rangeStart = viewMode === 'month'
    ? localDateStr(addDaysToDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), -mondayIndex(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))))
    : viewMode === 'week'
    ? localDateStr(addDaysToDate(currentDate, -mondayIndex(currentDate)))
    : localDateStr(rangeFrom);

  const rangeEnd = viewMode === 'month'
    ? (() => {
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        return localDateStr(addDaysToDate(monthEnd, 6 - mondayIndex(monthEnd)));
      })()
    : viewMode === 'week'
    ? localDateStr(addDaysToDate(currentDate, 6 - mondayIndex(currentDate)))
    : localDateStr(rangeTo);

  const loadHours = useCallback(async () => {
    setLoading(true);
    try {
      const map = await getWorkSecondsByDay(rangeStart, rangeEnd);
      setHoursMap(map);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => { loadHours(); }, [loadHours]);

  const periodTotal = Object.values(hoursMap).reduce((a, b) => a + b, 0);

  const navigateToDay = (date: Date) => {
    navigation.navigate('DayScreen', {date: localDateStr(date)});
  };

  const goBack = useCallback(() => {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(d => addDaysToDate(d, -7));
    }
  }, [viewMode]);

  const goForward = useCallback(() => {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(d => addDaysToDate(d, 7));
    }
  }, [viewMode]);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, {dx, dy}) =>
        Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5,
      onPanResponderRelease: (_, {dx}) => {
        if (Math.abs(dx) > 60 && viewMode !== 'range') {
          if (dx < 0) { goForward(); } else { goBack(); }
        }
      },
    }),
  [goBack, goForward, viewMode]);

  const weekDays = getWeekDays(currentDate);
  const headerLabel =
    viewMode === 'range'
      ? `${format(rangeFrom, 'MMM d')} – ${format(rangeTo, 'MMM d, yyyy')}`
      : viewMode === 'month'
      ? format(currentDate, 'MMMM yyyy')
      : `${format(weekDays[0], 'MMM d')} – ${format(weekDays[6], 'MMM d, yyyy')}`;

  return (
    <SafeAreaView style={styles.container}>
      <View {...panResponder.panHandlers}>
        {/* Header nav */}
        <View style={styles.header}>
          {viewMode !== 'range' ? (
            <TouchableOpacity onPress={goBack} style={styles.navBtn}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
          ) : <View style={styles.navBtn} />}
          <Text style={styles.periodLabel}>{headerLabel}</Text>
          {viewMode !== 'range' ? (
            <TouchableOpacity onPress={goForward} style={styles.navBtn}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          ) : <View style={styles.navBtn} />}
        </View>

        {/* Segment control */}
        <View style={styles.segmentRow}>
          {(['month', 'week', 'range'] as CalendarView[]).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[styles.segment, viewMode === mode && styles.segmentActive]}
              onPress={() => setViewMode(mode)}>
              <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                {mode === 'month' ? 'Month' : mode === 'week' ? 'Week' : 'Range'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Range date pickers */}
        {viewMode === 'range' && (
          <View style={styles.rangePickers}>
            <TouchableOpacity style={styles.rangeDateBtn} onPress={() => setShowFromPicker(true)}>
              <Text style={styles.rangeDateLabel}>From</Text>
              <Text style={styles.rangeDateValue}>{format(rangeFrom, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
            <Text style={styles.rangeSep}>→</Text>
            <TouchableOpacity style={styles.rangeDateBtn} onPress={() => setShowToPicker(true)}>
              <Text style={styles.rangeDateLabel}>To</Text>
              <Text style={styles.rangeDateValue}>{format(rangeTo, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {showFromPicker && (
          <DateTimePicker
            value={rangeFrom}
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            maximumDate={rangeTo}
            onChange={(_e, d) => { setShowFromPicker(false); if (d) { setRangeFrom(d); } }}
          />
        )}
        {showToPicker && (
          <DateTimePicker
            value={rangeTo}
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            minimumDate={rangeFrom}
            maximumDate={new Date()}
            onChange={(_e, d) => { setShowToPicker(false); if (d) { setRangeTo(d); } }}
          />
        )}

        {/* Period summary */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryLabel}>Total work this period</Text>
          {loading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.summaryValue}>{periodTotal > 0 ? formatHours(periodTotal) : '—'}</Text>
          }
        </View>
      </View>

      <ScrollView style={styles.flex}>
        {viewMode === 'month' ? (
          <MonthGrid
            currentDate={currentDate}
            hoursMap={hoursMap}
            showWeekNumbers={show_week_numbers}
            onDayPress={navigateToDay}
          />
        ) : viewMode === 'week' ? (
          <WeekView
            currentDate={currentDate}
            hoursMap={hoursMap}
            showWeekNumbers={show_week_numbers}
            onDayPress={navigateToDay}
          />
        ) : (
          <RangeView
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            hoursMap={hoursMap}
            onDayPress={navigateToDay}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Month grid ─────────────────────────────────────────────────────────────

const makeGridStyles = (c: Colors) =>
  StyleSheet.create({
    container: {paddingHorizontal: spacing.sm, paddingBottom: spacing.lg},
    headerRow: {flexDirection: 'row', marginBottom: spacing.xs},
    weekNumHeader: {
      width: 28,
      textAlign: 'center',
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      opacity: 0.5,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
    weekRow: {flexDirection: 'row', alignItems: 'center'},
    weekNum: {
      width: 28,
      textAlign: 'center',
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      opacity: 0.6,
      fontWeight: typography.weights.medium,
    },
    cell: {
      flex: 1,
      aspectRatio: 0.85,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      paddingVertical: 4,
    },
    cellOutside: {opacity: 0.3},
    cellToday: {backgroundColor: c.primary + '20'},
    cellHasHours: {backgroundColor: c.bgCard},
    dayNum: {fontSize: typography.sizes.sm, color: c.textPrimary},
    dayNumOutside: {color: c.textMuted},
    dayNumToday: {color: c.primary, fontWeight: typography.weights.bold},
    hours: {
      fontSize: 9,
      color: c.badgeWork,
      fontWeight: typography.weights.semibold,
      marginTop: 1,
    },
  });

function MonthGrid({currentDate, hoursMap, showWeekNumbers, onDayPress}: {
  currentDate: Date;
  hoursMap: Record<string, number>;
  showWeekNumbers: boolean;
  onDayPress: (d: Date) => void;
}) {
  const {colors} = useTheme();
  const gridStyles = useMemo(() => makeGridStyles(colors), [colors]);
  const days = getMonthGridDays(currentDate);
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Group into weeks of 7
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <View style={gridStyles.container}>
      <View style={gridStyles.headerRow}>
        {showWeekNumbers && <Text style={gridStyles.weekNumHeader}>W</Text>}
        {weekdays.map(d => <Text key={d} style={gridStyles.weekday}>{d}</Text>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={gridStyles.weekRow}>
          {showWeekNumbers && (
            <Text style={gridStyles.weekNum}>{getISOWeek(week[0])}</Text>
          )}
          {week.map(d => {
            const dateStr = localDateStr(d);
            const inMonth = isSameMonth(d, currentDate);
            const today = isToday(d);
            const workSecs = hoursMap[dateStr] ?? 0;
            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  gridStyles.cell,
                  !inMonth && gridStyles.cellOutside,
                  today && gridStyles.cellToday,
                  workSecs > 0 && inMonth && gridStyles.cellHasHours,
                ]}
                onPress={() => onDayPress(d)}
                activeOpacity={0.7}>
                <Text style={[
                  gridStyles.dayNum,
                  !inMonth && gridStyles.dayNumOutside,
                  today && gridStyles.dayNumToday,
                ]}>
                  {d.getDate()}
                </Text>
                {workSecs > 0 && inMonth
                  ? <Text style={gridStyles.hours}>{formatHours(workSecs)}</Text>
                  : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Week view ──────────────────────────────────────────────────────────────

const makeWeekStyles = (c: Colors) =>
  StyleSheet.create({
    container: {paddingHorizontal: spacing.sm, paddingBottom: spacing.lg},
    weekNumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    weekNumLabel: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
    row: {flexDirection: 'row', gap: spacing.xs},
    cell: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      gap: spacing.xs,
    },
    cellToday: {backgroundColor: c.primary + '15', borderColor: c.primary},
    dayName: {fontSize: typography.sizes.xs, color: c.textMuted, fontWeight: typography.weights.medium},
    dayNum: {fontSize: typography.sizes.md, color: c.textPrimary, fontWeight: typography.weights.semibold},
    dayNumToday: {color: c.primary},
    hours: {fontSize: typography.sizes.xs, color: c.badgeWork, fontWeight: typography.weights.bold},
    hoursEmpty: {fontSize: typography.sizes.xs, color: c.textMuted},
  });

function WeekView({currentDate, hoursMap, showWeekNumbers, onDayPress}: {
  currentDate: Date;
  hoursMap: Record<string, number>;
  showWeekNumbers: boolean;
  onDayPress: (d: Date) => void;
}) {
  const {colors} = useTheme();
  const weekStyles = useMemo(() => makeWeekStyles(colors), [colors]);
  const days = getWeekDays(currentDate);

  return (
    <View style={weekStyles.container}>
      {showWeekNumbers && (
        <View style={weekStyles.weekNumRow}>
          <Text style={weekStyles.weekNumLabel}>Week {getISOWeek(days[0])}</Text>
        </View>
      )}
      <View style={weekStyles.row}>
        {days.map(d => {
          const dateStr = localDateStr(d);
          const today = isToday(d);
          const workSecs = hoursMap[dateStr] ?? 0;
          return (
            <TouchableOpacity
              key={dateStr}
              style={[weekStyles.cell, today && weekStyles.cellToday]}
              onPress={() => onDayPress(d)}
              activeOpacity={0.7}>
              <Text style={weekStyles.dayName}>{format(d, 'EEE')}</Text>
              <Text style={[weekStyles.dayNum, today && weekStyles.dayNumToday]}>{d.getDate()}</Text>
              {workSecs > 0
                ? <Text style={weekStyles.hours}>{formatHours(workSecs)}</Text>
                : <Text style={weekStyles.hoursEmpty}>–</Text>
              }
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Range view ─────────────────────────────────────────────────────────────

const makeRangeStyles = (c: Colors) =>
  StyleSheet.create({
    list: {paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs},
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowToday: {borderColor: c.primary, backgroundColor: c.primary + '08'},
    weekday: {fontSize: typography.sizes.xs, color: c.textMuted, fontWeight: typography.weights.medium, marginBottom: 2},
    date: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.semibold},
    today: {color: c.primary},
    hours: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.badgeWork},
    empty: {fontSize: typography.sizes.md, color: c.textMuted},
  });

function RangeView({rangeFrom, rangeTo, hoursMap, onDayPress}: {
  rangeFrom: Date;
  rangeTo: Date;
  hoursMap: Record<string, number>;
  onDayPress: (d: Date) => void;
}) {
  const {colors} = useTheme();
  const rangeStyles = useMemo(() => makeRangeStyles(colors), [colors]);
  const days = eachDayOfInterval({start: rangeFrom, end: rangeTo});

  return (
    <View style={rangeStyles.list}>
      {days.map(d => {
        const dateStr = localDateStr(d);
        const workSecs = hoursMap[dateStr] ?? 0;
        const today = isToday(d);
        return (
          <TouchableOpacity
            key={dateStr}
            style={[rangeStyles.row, today && rangeStyles.rowToday]}
            onPress={() => onDayPress(d)}
            activeOpacity={0.7}>
            <View>
              <Text style={[rangeStyles.weekday, today && rangeStyles.today]}>{format(d, 'EEE')}</Text>
              <Text style={[rangeStyles.date, today && rangeStyles.today]}>{format(d, 'MMM d')}</Text>
            </View>
            <Text style={workSecs > 0 ? rangeStyles.hours : rangeStyles.empty}>
              {workSecs > 0 ? formatHours(workSecs) : '—'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
