import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {format} from 'date-fns';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useFocusEffect} from '@react-navigation/native';
import {useDayStore} from '../../store/dayStore';
import {useEntryStore} from '../../store/entryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {getDateFnsLocale} from '../../i18n';
import DayHoursReadout from './DayHoursReadout';
import DaySummaryCard from './DaySummaryCard';
import DaySplitBar from './DaySplitBar';
import SpecialNoteCard from './SpecialNoteCard';
import DayEndConfirmBanner from './DayEndConfirmBanner';
import QuickTimerCard from './QuickTimerCard';
import FilterBar from './FilterBar';
import EntryList from '../entries/EntryList';
import EntryListItem from '../entries/EntryListItem';
import {useShellPadding} from '../../navigation/shellMetrics';
import {useKeyboardHeight} from '../../hooks/useKeyboardHeight';
import {getUpcomingTodos} from '../../db/entries';
import {getLeaveRangesInRange} from '../../db/leaveRanges';
import {formatDate, nextDayDates, shiftDate} from '../../utils/dateUtils';
import {calcDayWorkSecs, calcHourBreakdown} from '../../utils/hoursUtils';
import {
  ensureDetectionSeed,
  getCurrentGeofenceDetection,
  type GeofenceDetection,
} from '../../services/gpsService';
import type {Day, Entry, LeaveRange, Project, Tag} from '../../types';
import LeaveBadges from '../entries/LeaveBadges';

interface Props {
  date: string;
  variant: 'today' | 'detail';
  onRequestDate: (date: string) => void;
  onOpenEntry: (entry: Entry) => void;
  onOpenLeave?: (range: LeaveRange) => void;
  onDayLoaded?: (day: Day | null) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    flex: {flex: 1, backgroundColor: c.bg},
    header: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    headerRow: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between'},
    headerDate: {fontSize: typography.sizes.xxl, fontWeight: typography.weights.black, color: c.textPrimary},
    headerSub: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    comingUp: {marginTop: spacing.lg},
    comingUpHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    comingUpDate: {
      fontSize: typography.sizes.xs,
      color: c.primary,
      fontWeight: typography.weights.semibold,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    whereAmI: {
      textAlign: 'center',
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
    },
  });

export default function DayView({
  date,
  variant,
  onRequestDate,
  onOpenEntry,
  onOpenLeave,
  onDayLoaded,
}: Props) {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isToday = variant === 'today';
  const shellPad = useShellPadding();
  const kbHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [upcoming, setUpcoming] = useState<Entry[]>([]);
  const [detected, setDetected] = useState<GeofenceDetection>('unknown');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [leaveRanges, setLeaveRanges] = useState<LeaveRange[]>([]);

  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const showPersonalHours = useSettingsStore(s => s.show_personal_hours);

  const day = daysCache[date];
  const allEntries = useMemo(() => (day ? (entriesByDay[day.id] ?? []) : []), [day, entriesByDay]);

  useEffect(() => { loadDay(date); }, [date, loadDay]);
  useEffect(() => { if (day) { loadEntriesForDay(day.id); } }, [day, loadEntriesForDay]);
  useEffect(() => { onDayLoaded?.(day ?? null); }, [day, onDayLoaded]);
  useFocusEffect(
    useCallback(() => {
      getLeaveRangesInRange(date, date)
        .then(setLeaveRanges)
        .catch(() => setLeaveRanges([]));
    }, [date]),
  );

  // Reset filters when the viewed date changes (detail swipe).
  useEffect(() => { setSelectedProjectId(null); setSelectedTagIds([]); }, [date]);

  // Lift the day-note card above the keyboard once it's shown.
  useEffect(() => {
    if (noteEditing && kbHeight > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: true}));
    }
  }, [noteEditing, kbHeight]);

  // --- Today-only effects ---
  const loadUpcoming = useCallback(() => {
    getUpcomingTodos(nextDayDates()).then(setUpcoming).catch(() => {});
  }, []);

  // Home owns today's current-date/SQLite refresh. This view only refreshes the
  // upcoming list on focus.
  useFocusEffect(
    useCallback(() => {
      if (isToday) { loadUpcoming(); }
    }, [isToday, loadUpcoming]),
  );

  // Poll geofence membership for the "where am I" line.
  useEffect(() => {
    if (!isToday) { return; }
    // While parked the native service delivers no fixes (IDLE mode), so ask
    // for a one-shot seed when nothing is known — internally guarded, so
    // calling it every tick is free once a position exists.
    const tick = () => {
      setDetected(getCurrentGeofenceDetection());
      ensureDetectionSeed()
        .then(() => setDetected(getCurrentGeofenceDetection()))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [isToday]);

  const placeLabel = (d: GeofenceDetection) =>
    d === 'work' ? t('location.work')
      : d === 'home' ? t('location.home')
      : d === 'other' ? t('location.placeOther')
      : t('location.placeUnknown');

  // Filter chips list only the projects/tags used in this day's notes.
  const dayProjects = useMemo(() => {
    const seen = new Map<number, Project>();
    for (const e of allEntries) { if (e.project) { seen.set(e.project.id, e.project); } }
    return [...seen.values()];
  }, [allEntries]);
  const dayTags = useMemo(() => {
    const seen = new Map<number, Tag>();
    for (const e of allEntries) { for (const tag of e.tags ?? []) { seen.set(tag.id, tag); } }
    return [...seen.values()];
  }, [allEntries]);

  const filteredEntries: Entry[] = allEntries.filter(e => {
    if (selectedProjectId != null && e.project?.id !== selectedProjectId) { return false; }
    if (selectedTagIds.length > 0) {
      const entryTagIds = (e.tags ?? []).map(x => x.id);
      if (!selectedTagIds.every(id => entryTagIds.includes(id))) { return false; }
    }
    return true;
  });

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);
  const clearFilters = useCallback(() => { setSelectedProjectId(null); setSelectedTagIds([]); }, []);

  const totalSecs = day ? calcDayWorkSecs(day, allEntries) : 0;
  const personalSecs = day ? calcHourBreakdown(allEntries).personalSeconds : 0;

  // Swipe = prev/next day. Today is the end of the line (no forward swipe).
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd(e => {
          if (e.translationX >= 50) { onRequestDate(shiftDate(date, -1)); }
          else if (e.translationX <= -50 && !isToday) { onRequestDate(shiftDate(date, 1)); }
        }),
    [date, isToday, onRequestDate],
  );

  const upcomingGroups = useMemo(() => {
    const out: {date: string; items: Entry[]}[] = [];
    for (const e of upcoming) {
      const key = e.scheduled_date ?? '';
      const last = out[out.length - 1];
      if (last && last.date === key) { last.items.push(e); }
      else { out.push({date: key, items: [e]}); }
    }
    return out;
  }, [upcoming]);

  const hasFilterable = dayProjects.length > 0 || dayTags.length > 0;

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View key={date} entering={FadeIn.duration(140)} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            isToday
              ? {paddingTop: shellPad.paddingTop, paddingBottom: shellPad.paddingBottom}
              : {paddingTop: spacing.md, paddingBottom: shellPad.paddingBottom},
            noteEditing && kbHeight > 0 && {paddingBottom: kbHeight + spacing.lg},
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          {isToday && (
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <Text style={styles.headerDate}>{formatDate(date)}</Text>
                <DayHoursReadout workSecs={totalSecs} personalSecs={personalSecs} showPersonal={showPersonalHours} />
              </View>
              <Text style={styles.headerSub}>
                {format(new Date(), 'EEEE, MMMM d, yyyy', {
                  locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
                })}
              </Text>
            </View>
          )}
          {hasFilterable && (
            <FilterBar
              projects={dayProjects}
              tags={dayTags}
              selectedProjectId={selectedProjectId}
              selectedTagIds={selectedTagIds}
              onSelectProject={setSelectedProjectId}
              onToggleTag={toggleTag}
              onClear={clearFilters}
            />
          )}
          {isToday && <DayEndConfirmBanner />}
          {isToday && <QuickTimerCard />}
          {leaveRanges.length > 0 && (
            <View style={styles.header}>
              <LeaveBadges ranges={leaveRanges} onPress={onOpenLeave} />
            </View>
          )}
          {day && (
            <DaySummaryCard day={day} entries={allEntries} onUpdateTimes={fields => updateDayTimes(date, fields)} />
          )}
          {day && <DaySplitBar entries={allEntries} />}
          <EntryList inline card entries={filteredEntries} onPressEntry={onOpenEntry} />
          {isToday && upcoming.length > 0 && (
            <View style={styles.comingUp}>
              <Text style={styles.comingUpHeader}>{t('todo.comingUp')}</Text>
              {upcomingGroups.map(group => (
                <View key={group.date}>
                  <Text style={styles.comingUpDate}>{formatDate(group.date)}</Text>
                  {group.items.map(e => (
                    <EntryListItem key={e.id} entry={e} onPress={() => onOpenEntry(e)} />
                  ))}
                </View>
              ))}
            </View>
          )}
          {isToday && (
            <Text style={styles.whereAmI}>{t('location.detected', {place: placeLabel(detected)})}</Text>
          )}
          {day && (
            <SpecialNoteCard
              note={day.notes}
              onSave={notes => updateDayTimes(date, {notes})}
              onBeginEdit={() => setNoteEditing(true)}
              onEndEdit={() => setNoteEditing(false)}
            />
          )}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
