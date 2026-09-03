import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {format, parseISO} from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import Animated, {FadeIn} from 'react-native-reanimated';
import {useFocusEffect} from '@react-navigation/native';
import {useDayStore} from '../../store/dayStore';
import {useEntryStore} from '../../store/entryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useSessionStore} from '../../store/sessionStore';
import {useTimerParent} from '../../services/timerSubnotes';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {getDateFnsLocale} from '../../i18n';
import DayHoursReadout from './DayHoursReadout';
import DaySummaryCard from './DaySummaryCard';
import DayDetailsSheet from './DayDetailsSheet';
import SpecialNoteCard from './SpecialNoteCard';
import DayEndConfirmBanner from './DayEndConfirmBanner';
import QuickTimerCard from './QuickTimerCard';
import EntryList from '../entries/EntryList';
import EntryListItem from '../entries/EntryListItem';
import {useShellPadding} from '../../navigation/shellMetrics';
import {useKeyboardHeight} from '../../hooks/useKeyboardHeight';
import {getUpcomingTodos} from '../../db/entries';
import {getLeaveRangesInRange} from '../../db/leaveRanges';
import {formatDate, nextDayDates, shiftDate, todayDate} from '../../utils/dateUtils';
import {calcDayWorkSecs, calcHourBreakdown} from '../../utils/hoursUtils';
import {
  ensureDetectionSeed,
  getCurrentGeofenceDetection,
  type GeofenceDetection,
} from '../../services/gpsService';
import type {Day, Entry, LeaveRange} from '../../types';
import LeaveBadges from '../entries/LeaveBadges';

interface Props {
  date: string;
  onRequestDate: (date: string) => void;
  onOpenEntry: (entry: Entry) => void;
  onAddSubnote?: (entry: Entry) => void;
  onOpenLeave?: (range: LeaveRange) => void;
  onOpenMap: () => void;
  onDayLoaded?: (day: Day | null) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    flex: {flex: 1, backgroundColor: c.bg},
    // Sections are spaced only by the ScrollView's `gap`; roots carry no vertical margin.
    content: {gap: spacing.lg},
    header: {paddingHorizontal: spacing.lg},
    headerRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    titleWrap: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: -spacing.sm},
    headerRight: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
    hidden: {opacity: 0},
    headerDate: {fontSize: typography.sizes.xxl, fontWeight: typography.weights.black, color: c.textPrimary},
    headerSub: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    comingUp: {},
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
    },
  });

export default function DayView({
  date,
  onRequestDate,
  onOpenEntry,
  onAddSubnote,
  onOpenLeave,
  onOpenMap,
  onDayLoaded,
}: Props) {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isToday = date === todayDate();
  const canGoForward = date < todayDate(); // ISO dates compare lexically
  const dateLocale = getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en');
  const shellPad = useShellPadding();
  const kbHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const [noteEditing, setNoteEditing] = useState(false);
  const [upcoming, setUpcoming] = useState<Entry[]>([]);
  const [detected, setDetected] = useState<GeofenceDetection>('unknown');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leaveRanges, setLeaveRanges] = useState<LeaveRange[]>([]);

  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const showPersonalHours = useSettingsStore(s => s.show_personal_hours);
  const subnotesDefault = useSettingsStore(s => s.subnotes_expanded);
  const [showSubnotes, setShowSubnotes] = useState(subnotesDefault);

  const sessionActive = useSessionStore(s => s.active != null);
  const timerParentId = useTimerParent(s => s.parentId);

  const day = daysCache[date];
  const allEntries = useMemo(() => {
    const list = day ? (entriesByDay[day.id] ?? []) : [];
    // The running timer's note + its subnotes stay off the list until it stops.
    return sessionActive && timerParentId != null
      ? list.filter(e => e.id !== timerParentId && e.parent_id !== timerParentId)
      : list;
  }, [day, entriesByDay, sessionActive, timerParentId]);

  // Refresh on focus (covers mount + returning from a note). loadDay always
  // rereads SQLite, so native day-ends written while away show up here.
  useFocusEffect(useCallback(() => { loadDay(date); }, [date, loadDay]));
  useEffect(() => { if (day) { loadEntriesForDay(day.id); } }, [day, loadEntriesForDay]);
  useEffect(() => { onDayLoaded?.(day ?? null); }, [day, onDayLoaded]);
  useFocusEffect(
    useCallback(() => {
      getLeaveRangesInRange(date, date)
        .then(setLeaveRanges)
        .catch(() => setLeaveRanges([]));
    }, [date]),
  );

  // Subnote expansion: per-visit override of the Interface default.
  useEffect(() => { setShowSubnotes(subnotesDefault); }, [date, subnotesDefault]);

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
          else if (e.translationX <= -50 && canGoForward) { onRequestDate(shiftDate(date, 1)); }
        }),
    [date, canGoForward, onRequestDate],
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

  const hasSubnotes = allEntries.some(e => e.parent_id != null);

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View key={date} entering={FadeIn.duration(140)} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {paddingTop: shellPad.paddingTop, paddingBottom: shellPad.paddingBottom},
            noteEditing && kbHeight > 0 && {paddingBottom: kbHeight + spacing.lg},
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerRow}>
              {/* ‹ date › — the visible hint that days are navigable; swipe does the same. */}
              <View style={styles.titleWrap}>
                <TouchableOpacity
                  onPress={() => onRequestDate(shiftDate(date, -1))}
                  hitSlop={8}
                  accessibilityLabel={t('dates.previousDay')}>
                  <Icon name="chevron-left" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.headerDate}>{formatDate(date)}</Text>
                <TouchableOpacity
                  onPress={() => onRequestDate(shiftDate(date, 1))}
                  disabled={!canGoForward}
                  style={!canGoForward && styles.hidden}
                  hitSlop={8}
                  accessibilityLabel={t('dates.nextDay')}>
                  <Icon name="chevron-right" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.headerRight}>
                <DayHoursReadout
                  workSecs={totalSecs}
                  personalSecs={personalSecs}
                  showPersonal={showPersonalHours}
                  onPress={() => setDetailsOpen(true)}
                />
                <TouchableOpacity onPress={onOpenMap} hitSlop={8} accessibilityLabel={t('dayMap.title')}>
                  <Icon name="map-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.headerSub}>
              {format(parseISO(date), 'EEEE, MMMM d, yyyy', {locale: dateLocale})}
            </Text>
          </View>
          {isToday && <DayEndConfirmBanner />}
          {isToday && <QuickTimerCard />}
          {leaveRanges.length > 0 && (
            <View style={styles.header}>
              <LeaveBadges ranges={leaveRanges} onPress={onOpenLeave} />
            </View>
          )}
          {day && (
            <DaySummaryCard
              day={day}
              entries={allEntries}
              onUpdateTimes={fields => updateDayTimes(date, fields)}
              onOpenDetails={() => setDetailsOpen(true)}
            />
          )}
          <EntryList
            inline
            card
            entries={allEntries}
            showSubnotes={showSubnotes}
            subnotesToggle={hasSubnotes ? {expanded: showSubnotes, onToggle: () => setShowSubnotes(v => !v)} : undefined}
            onPressEntry={onOpenEntry}
            onAddSubnote={onAddSubnote}
          />
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
        {day && (
          <DayDetailsSheet
            visible={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            day={day}
            entries={allEntries}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}
