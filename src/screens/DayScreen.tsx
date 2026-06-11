import React, {useEffect} from 'react';
import {StyleSheet, SafeAreaView, ScrollView} from 'react-native';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {colors, spacing} from '../theme';
import EntryList from '../components/entries/EntryList';
import DaySummaryCard from '../components/day/DaySummaryCard';
import FAB from '../components/ui/FAB';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'DayScreen'>;

export default function DayScreen({navigation, route}: Props) {
  const {date} = route.params;
  const {loadDay, daysCache, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();

  const day = daysCache[date];
  const entries = day ? (entriesByDay[day.id] ?? []) : [];

  useEffect(() => {
    loadDay(date);
  }, [date, loadDay]);

  useEffect(() => {
    if (day) {
      loadEntriesForDay(day.id);
    }
  }, [day, loadEntriesForDay]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}>
        {day && (
          <DaySummaryCard
            day={day}
            entries={entries}
            onChangeStarted={iso => updateDayTimes(date, iso, day.ended_at)}
            onChangeEnded={iso => updateDayTimes(date, day.started_at, iso)}
          />
        )}
        <EntryList
          inline
          entries={entries}
          onPressEntry={entry =>
            navigation.navigate('EntryDetailScreen', {
              entryId: entry.id,
              dayId: entry.day_id,
            })
          }
        />
      </ScrollView>
      <FAB
        onPress={() => {
          if (!day) {
            return;
          }
          navigation.navigate('AddEntryModal', {date, dayId: day.id});
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {flex: 1},
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
});
