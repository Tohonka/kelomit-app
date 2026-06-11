import React, {useEffect, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import EntryList from '../components/entries/EntryList';
import DaySummaryCard from '../components/day/DaySummaryCard';
import FAB from '../components/ui/FAB';
import type {TabScreenProps} from '../navigation/navigationTypes';
import {formatDate, todayDate} from '../utils/dateUtils';
import {calcDayWorkSecs, formatHours} from '../utils/hoursUtils';

type Props = TabScreenProps<'Home'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    headerDate: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
    },
    headerTotal: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: c.primary,
    },
    headerSub: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    flex: {flex: 1},
    scrollContent: {paddingTop: spacing.md, paddingBottom: 100},
  });

export default function HomeScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {today, loadToday, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();

  const date = todayDate();
  const entries = today ? (entriesByDay[today.id] ?? []) : [];
  const totalSecs = today ? calcDayWorkSecs(today, entries) : 0;

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => {
    if (today) { loadEntriesForDay(today.id); }
  }, [today, loadEntriesForDay]);

  const openAddEntry = () => {
    if (!today) { return; }
    navigation.navigate('AddEntryModal', {date, dayId: today.id});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerDate}>{formatDate(date)}</Text>
          {totalSecs > 0 && (
            <Text style={styles.headerTotal}>{formatHours(totalSecs)}</Text>
          )}
        </View>
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
            onUpdateTimes={fields => updateDayTimes(date, fields)}
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
