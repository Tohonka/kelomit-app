import React, {useEffect, useState, useCallback, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {StyleSheet, ScrollView, View, Text} from 'react-native';
import {format} from 'date-fns';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {useProjectStore} from '../store/projectStore';
import {useTagStore} from '../store/tagStore';
import {useTheme, typography, spacing} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Colors} from '../theme';
import EntryList from '../components/entries/EntryList';
import DaySummaryCard from '../components/day/DaySummaryCard';
import DaySplitBar from '../components/day/DaySplitBar';
import FilterBar from '../components/day/FilterBar';
import FAB from '../components/ui/FAB';
import {buildQuickAddActions} from '../components/entries/quickAddActions';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {Entry} from '../types';
import {calcDayWorkSecs, formatHours} from '../utils/hoursUtils';

type Props = RootStackScreenProps<'DayScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    flex: {flex: 1},
    scrollContent: {paddingTop: spacing.md, paddingBottom: 100},
    headerTotal: {
      color: c.primary,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      marginRight: spacing.md,
    },
  });

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DayScreen({navigation, route}: Props) {
  const {i18n} = useTranslation();
  const [currentDate, setCurrentDate] = useState(route.params.date);
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const {projects, loaded: projectsLoaded, load: loadProjects} = useProjectStore();
  const {tags, loaded: tagsLoaded, load: loadTags} = useTagStore();

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const day = daysCache[currentDate];
  const allEntries = useMemo(
    () => (day ? (entriesByDay[day.id] ?? []) : []),
    [day, entriesByDay],
  );

  useEffect(() => { loadDay(currentDate); }, [currentDate, loadDay]);
  useEffect(() => { if (day) { loadEntriesForDay(day.id); } }, [day, loadEntriesForDay]);
  useEffect(() => { if (!projectsLoaded) { loadProjects(); } }, [projectsLoaded, loadProjects]);
  useEffect(() => { if (!tagsLoaded) { loadTags(); } }, [tagsLoaded, loadTags]);

  // Update navigation title and work-hours in header when day/entries change
  useEffect(() => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const label = format(dateObj, 'EEE d MMM', {
      locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
    });
    const totalSecs = day ? calcDayWorkSecs(day, allEntries) : 0;
    navigation.setOptions({
      title: label,
      headerRight: totalSecs > 0
        ? () => <Text style={styles.headerTotal}>{formatHours(totalSecs)}</Text>
        : undefined,
    });
  }, [currentDate, day, allEntries, navigation, styles, i18n.resolvedLanguage]);

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
        projects={projects}
        tags={tags}
        selectedProjectId={selectedProjectId}
        selectedTagIds={selectedTagIds}
        onSelectProject={setSelectedProjectId}
        onToggleTag={toggleTag}
        onClear={clearFilters}
      />
      <GestureDetector gesture={swipe}>
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
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
          </ScrollView>
        </View>
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
