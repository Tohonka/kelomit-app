import React, {useEffect, useState, useCallback, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {StyleSheet, ScrollView} from 'react-native';
import Animated, {FadeIn} from 'react-native-reanimated';
import {format} from 'date-fns';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {useTheme, spacing} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Colors} from '../theme';
import EntryList from '../components/entries/EntryList';
import DaySummaryCard from '../components/day/DaySummaryCard';
import DaySplitBar from '../components/day/DaySplitBar';
import SpecialNoteCard from '../components/day/SpecialNoteCard';
import FilterBar from '../components/day/FilterBar';
import FAB from '../components/ui/FAB';
import {buildQuickAddActions} from '../components/entries/quickAddActions';
import {useKeyboardHeight} from '../hooks/useKeyboardHeight';
import type {HomeStackScreenProps} from '../navigation/navigationTypes';
import type {Entry, Project, Tag} from '../types';
import {calcDayWorkSecs, calcHourBreakdown} from '../utils/hoursUtils';
import {useSettingsStore} from '../store/settingsStore';
import DayHoursReadout from '../components/day/DayHoursReadout';
import {shiftDate} from '../utils/dateUtils';

type Props = HomeStackScreenProps<'DayScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    flex: {flex: 1},
    scrollContent: {paddingTop: spacing.md, paddingBottom: 100},
  });

export default function DayScreen({navigation, route}: Props) {
  const {i18n} = useTranslation();
  const [currentDate, setCurrentDate] = useState(route.params.date);
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const scrollRef = useRef<ScrollView>(null);
  const kbHeight = useKeyboardHeight();
  const [noteEditing, setNoteEditing] = useState(false);
  const showPersonalHours = useSettingsStore(s => s.show_personal_hours);

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const day = daysCache[currentDate];
  const allEntries = useMemo(
    () => (day ? (entriesByDay[day.id] ?? []) : []),
    [day, entriesByDay],
  );

  // Filter chips list only the projects/tags actually used in this day's notes.
  const dayProjects = useMemo(() => {
    const seen = new Map<number, Project>();
    for (const e of allEntries) {
      if (e.project) { seen.set(e.project.id, e.project); }
    }
    return [...seen.values()];
  }, [allEntries]);
  const dayTags = useMemo(() => {
    const seen = new Map<number, Tag>();
    for (const e of allEntries) {
      for (const tag of e.tags ?? []) { seen.set(tag.id, tag); }
    }
    return [...seen.values()];
  }, [allEntries]);

  useEffect(() => { loadDay(currentDate); }, [currentDate, loadDay]);
  useEffect(() => { if (day) { loadEntriesForDay(day.id); } }, [day, loadEntriesForDay]);
  // Lift the day-note card above the keyboard once it's actually shown.
  useEffect(() => {
    if (noteEditing && kbHeight > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({animated: true}));
    }
  }, [noteEditing, kbHeight]);

  // Update navigation title and work-hours in header when day/entries change
  useEffect(() => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const label = format(dateObj, 'EEE d MMM', {
      locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
    });
    const totalSecs = day ? calcDayWorkSecs(day, allEntries) : 0;
    const personalSecs = day ? calcHourBreakdown(allEntries).personalSeconds : 0;
    navigation.setOptions({
      title: label,
      headerRight: () => (
        <DayHoursReadout
          workSecs={totalSecs}
          personalSecs={personalSecs}
          showPersonal={showPersonalHours}
          style={{marginRight: spacing.md}}
        />
      ),
    });
  }, [currentDate, day, allEntries, navigation, showPersonalHours, i18n.resolvedLanguage]);

  const goToDate = useCallback((newDate: string) => {
    setCurrentDate(newDate);
    setSelectedProjectId(null);
    setSelectedTagIds([]);
  }, []);

  // Horizontal swipe = prev/next day. failOffsetY keeps vertical scrolling intact.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd(e => {
          // Swipe left = next day, swipe right = previous day.
          if (e.translationX <= -50) { goToDate(shiftDate(currentDate, 1)); }
          else if (e.translationX >= 50) { goToDate(shiftDate(currentDate, -1)); }
        }),
    [currentDate, goToDate],
  );

  const filteredEntries: Entry[] = allEntries.filter(e => {
    if (selectedProjectId != null && e.project?.id !== selectedProjectId) { return false; }
    if (selectedTagIds.length > 0) {
      const entryTagIds = (e.tags ?? []).map(t => t.id);
      if (!selectedTagIds.every(id => entryTagIds.includes(id))) { return false; }
    }
    return true;
  });

  const toggleTag = useCallback((id: number) => {
    setSelectedTagIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedProjectId(null);
    setSelectedTagIds([]);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <FilterBar
        projects={dayProjects}
        tags={dayTags}
        selectedProjectId={selectedProjectId}
        selectedTagIds={selectedTagIds}
        onSelectProject={setSelectedProjectId}
        onToggleTag={toggleTag}
        onClear={clearFilters}
      />
      <GestureDetector gesture={swipe}>
        <Animated.View key={currentDate} entering={FadeIn.duration(140)} style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              noteEditing && kbHeight > 0 && {paddingBottom: kbHeight + spacing.lg},
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled">
            {day && (
              <DaySummaryCard
                day={day}
                entries={allEntries}
                onUpdateTimes={fields => updateDayTimes(currentDate, fields)}
              />
            )}
            {day && <DaySplitBar entries={allEntries} />}
            <EntryList
              inline
              entries={filteredEntries}
              onPressEntry={entry =>
                navigation.navigate('EntryDetailScreen', {
                  entryId: entry.id,
                  dayId: entry.day_id,
                })
              }
            />
            {day && (
              <SpecialNoteCard
                note={day.notes}
                onSave={notes => updateDayTimes(currentDate, {notes})}
                onBeginEdit={() => setNoteEditing(true)}
                onEndEdit={() => setNoteEditing(false)}
              />
            )}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
      <FAB
        onPress={() => {
          if (!day) { return; }
          navigation.navigate('AddEntryModal', {date: currentDate, dayId: day.id});
        }}
        actions={
          day
            ? buildQuickAddActions(entryType =>
                navigation.navigate('QuickAddModal', {date: currentDate, dayId: day.id, entryType}),
              )
            : undefined
        }
      />
    </SafeAreaView>
  );
}
