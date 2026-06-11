import React, {useEffect} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView} from 'react-native';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {colors, typography, spacing} from '../theme';
import EntryList from '../components/entries/EntryList';
import DaySummaryCard from '../components/day/DaySummaryCard';
import FAB from '../components/ui/FAB';
import type {TabScreenProps} from '../navigation/navigationTypes';
import {formatDate, todayDate} from '../utils/dateUtils';

type Props = TabScreenProps<'Home'>;

export default function HomeScreen({navigation}: Props) {
  const {today, loadToday, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();

  const date = todayDate();
  const entries = today ? (entriesByDay[today.id] ?? []) : [];

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  useEffect(() => {
    if (today) {
      loadEntriesForDay(today.id);
    }
  }, [today, loadEntriesForDay]);

  const openAddEntry = () => {
    if (!today) {
      return;
    }
    navigation.navigate('AddEntryModal', {date, dayId: today.id});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerDate}>{formatDate(date)}</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        {today && (
          <DaySummaryCard
            day={today}
            entries={entries}
            onChangeStarted={iso => updateDayTimes(date, iso, today.ended_at)}
            onChangeEnded={iso => updateDayTimes(date, today.started_at, iso)}
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

      <FAB onPress={openAddEntry} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerDate: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  flex: {flex: 1},
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
});
