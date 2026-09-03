import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {useShellPadding} from '../navigation/shellMetrics';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useFocusEffect} from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {format, eachDayOfInterval, isToday, getISOWeek, subDays} from 'date-fns';
import {useTheme, typography, spacing, radius} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Colors} from '../theme';
import {useSettingsStore} from '../store/settingsStore';
import {getWorkSecondsByDay, getUpcomingTodos} from '../db/entries';
import {
  getLeaveRangesInRange,
  leavesByDate,
} from '../db/leaveRanges';
import {formatHours} from '../utils/hoursUtils';
import {formatDate} from '../utils/dateUtils';
import EntryListItem from '../components/entries/EntryListItem';
import LeaveBadges from '../components/entries/LeaveBadges';
import type {Entry, LeaveRange} from '../types';
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
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const {show_week_numbers, language} = useSettingsStore();
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hoursMap, setHoursMap] = useState<Record<string, number>>({});
  const [leaveMap, setLeaveMap] = useState<Record<string, LeaveRange[]>>({});
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
      const [hours, leaves] = await Promise.all([
        getWorkSecondsByDay(rangeStart, rangeEnd),
        getLeaveRangesInRange(rangeStart, rangeEnd),
      ]);
      setHoursMap(hours);
      setLeaveMap(leavesByDate(leaves, rangeStart, rangeEnd));
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  // Reload on focus so totals refresh after editing a day/entries elsewhere.
  // Also re-runs whenever the period (loadHours identity) changes.
  useFocusEffect(
    useCallback(() => {
      loadHours();
    }, [loadHours]),
  );

  const periodTotal = Object.values(hoursMap).reduce((a, b) => a + b, 0);

  const navigateToDay = (date: Date) => {
    navigation.navigate('Home', {date: localDateStr(date)});
  };

  const openEntry = (entry: Entry) => {
    navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id});
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

  // Horizontal swipe = prev/next period. activeOffsetX requires a clear
  // horizontal intent; failOffsetY hands vertical drags to the inner ScrollView.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd(e => {
          if (viewMode === 'range') { return; }
          // Swipe left = next period, swipe right = previous period.
          if (e.translationX <= -50) { goForward(); }
          else if (e.translationX >= 50) { goBack(); }
        }),
    [goBack, goForward, viewMode],
  );

  const weekDays = getWeekDays(currentDate);
  const dateLocale = getDateFnsLocale(language);
  const headerLabel =
    viewMode === 'range'
      ? `${format(rangeFrom, 'MMM d', {locale: dateLocale})} – ${format(rangeTo, 'MMM d, yyyy', {locale: dateLocale})}`
      : viewMode === 'month'
      ? format(currentDate, 'MMMM yyyy', {locale: dateLocale})
      : `${format(weekDays[0], 'MMM d', {locale: dateLocale})} – ${format(weekDays[6], 'MMM d, yyyy', {locale: dateLocale})}`;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={swipe}>
        <View style={styles.flex}>
        <View style={{paddingTop: shellPad.paddingTop}}>
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
                {mode === 'month'
                  ? t('calendar.month')
                  : mode === 'week'
                  ? t('calendar.week')
                  : t('calendar.range')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Range date pickers */}
        {viewMode === 'range' && (
          <View style={styles.rangePickers}>
            <TouchableOpacity style={styles.rangeDateBtn} onPress={() => setShowFromPicker(true)}>
              <Text style={styles.rangeDateLabel}>{t('common.from')}</Text>
              <Text style={styles.rangeDateValue}>
                {format(rangeFrom, 'MMM d, yyyy', {locale: dateLocale})}
              </Text>
            </TouchableOpacity>
            <Text style={styles.rangeSep}>→</Text>
            <TouchableOpacity style={styles.rangeDateBtn} onPress={() => setShowToPicker(true)}>
              <Text style={styles.rangeDateLabel}>{t('common.to')}</Text>
              <Text style={styles.rangeDateValue}>
                {format(rangeTo, 'MMM d, yyyy', {locale: dateLocale})}
              </Text>
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
          <Text style={styles.summaryLabel}>{t('calendar.totalWorkThisPeriod')}</Text>
          {loading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.summaryValue}>{periodTotal > 0 ? formatHours(periodTotal) : '—'}</Text>
          }
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{paddingBottom: shellPad.paddingBottom}}>
        {viewMode === 'month' ? (
          <MonthGrid
            currentDate={currentDate}
            hoursMap={hoursMap}
            leaveMap={leaveMap}
            showWeekNumbers={show_week_numbers}
            language={language}
            onDayPress={navigateToDay}
          />
        ) : viewMode === 'week' ? (
          <WeekView
            currentDate={currentDate}
            hoursMap={hoursMap}
            leaveMap={leaveMap}
            showWeekNumbers={show_week_numbers}
            language={language}
            onDayPress={navigateToDay}
            onOpenEntry={openEntry}
          />
        ) : (
          <RangeView
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            hoursMap={hoursMap}
            leaveMap={leaveMap}
            language={language}
            onDayPress={navigateToDay}
          />
        )}
      </ScrollView>
        </View>
      </GestureDetector>
    </View>
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

function MonthGrid({currentDate, hoursMap, leaveMap, showWeekNumbers, onDayPress}: {
  currentDate: Date;
  hoursMap: Record<string, number>;
  leaveMap: Record<string, LeaveRange[]>;
  showWeekNumbers: boolean;
  language: 'en' | 'fi';
  onDayPress: (d: Date) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const gridStyles = useMemo(() => makeGridStyles(colors), [colors]);
  const days = getMonthGridDays(currentDate);
  const weekdays = [
    t('calendar.weekdaysShort.mon'),
    t('calendar.weekdaysShort.tue'),
    t('calendar.weekdaysShort.wed'),
    t('calendar.weekdaysShort.thu'),
    t('calendar.weekdaysShort.fri'),
    t('calendar.weekdaysShort.sat'),
    t('calendar.weekdaysShort.sun'),
  ];

  // Group into weeks of 7
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <View style={gridStyles.container}>
      <View style={gridStyles.headerRow}>
        {showWeekNumbers && <Text style={gridStyles.weekNumHeader}>{t('dates.weekShort')}</Text>}
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
                {inMonth && (
                  <LeaveBadges ranges={leaveMap[dateStr] ?? []} compact />
                )}
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
    comingUpHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xs,
    },
    comingUpDate: {
      fontSize: typography.sizes.xs,
      color: c.primary,
      fontWeight: typography.weights.semibold,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
  });

function WeekView({currentDate, hoursMap, leaveMap, showWeekNumbers, language, onDayPress, onOpenEntry}: {
  currentDate: Date;
  hoursMap: Record<string, number>;
  leaveMap: Record<string, LeaveRange[]>;
  showWeekNumbers: boolean;
  language: 'en' | 'fi';
  onDayPress: (d: Date) => void;
  onOpenEntry: (entry: Entry) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const weekStyles = useMemo(() => makeWeekStyles(colors), [colors]);
  const days = getWeekDays(currentDate);
  const dateLocale = getDateFnsLocale(language);
  const weekKey = localDateStr(days[0]);

  const [upcoming, setUpcoming] = useState<Entry[]>([]);
  useEffect(() => {
    const dates = Array.from({length: 7}, (_, i) =>
      localDateStr(addDaysToDate(new Date(`${weekKey}T12:00:00`), i)),
    );
    getUpcomingTodos(dates).then(setUpcoming).catch(() => {});
  }, [weekKey]);

  const upcomingGroups: {date: string; items: Entry[]}[] = [];
  for (const e of upcoming) {
    const key = e.scheduled_date ?? '';
    const last = upcomingGroups[upcomingGroups.length - 1];
    if (last && last.date === key) { last.items.push(e); }
    else { upcomingGroups.push({date: key, items: [e]}); }
  }

  return (
    <View style={weekStyles.container}>
      {showWeekNumbers && (
        <View style={weekStyles.weekNumRow}>
          <Text style={weekStyles.weekNumLabel}>{t('dates.weekNumber', {week: getISOWeek(days[0])})}</Text>
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
              <Text style={weekStyles.dayName}>{format(d, 'EEE', {locale: dateLocale})}</Text>
              <Text style={[weekStyles.dayNum, today && weekStyles.dayNumToday]}>{d.getDate()}</Text>
              {workSecs > 0
                ? <Text style={weekStyles.hours}>{formatHours(workSecs)}</Text>
                : <Text style={weekStyles.hoursEmpty}>–</Text>
              }
              <LeaveBadges ranges={leaveMap[dateStr] ?? []} compact />
            </TouchableOpacity>
          );
        })}
      </View>

      {upcoming.length > 0 && (
        <View>
          <Text style={weekStyles.comingUpHeader}>{t('todo.comingUp')}</Text>
          {upcomingGroups.map(group => (
            <View key={group.date}>
              <Text style={weekStyles.comingUpDate}>{formatDate(group.date)}</Text>
              {group.items.map(e => (
                <EntryListItem key={e.id} entry={e} onPress={() => onOpenEntry(e)} />
              ))}
            </View>
          ))}
        </View>
      )}
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

function RangeView({rangeFrom, rangeTo, hoursMap, leaveMap, language, onDayPress}: {
  rangeFrom: Date;
  rangeTo: Date;
  hoursMap: Record<string, number>;
  leaveMap: Record<string, LeaveRange[]>;
  language: 'en' | 'fi';
  onDayPress: (d: Date) => void;
}) {
  const {colors} = useTheme();
  const rangeStyles = useMemo(() => makeRangeStyles(colors), [colors]);
  const days = eachDayOfInterval({start: rangeFrom, end: rangeTo});
  const dateLocale = getDateFnsLocale(language);

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
              <Text style={[rangeStyles.weekday, today && rangeStyles.today]}>
                {format(d, 'EEE', {locale: dateLocale})}
              </Text>
              <Text style={[rangeStyles.date, today && rangeStyles.today]}>
                {format(d, 'MMM d', {locale: dateLocale})}
              </Text>
              <LeaveBadges ranges={leaveMap[dateStr] ?? []} />
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
