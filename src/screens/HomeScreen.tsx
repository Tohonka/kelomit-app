import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {format} from 'date-fns';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {useTheme, typography, spacing} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Colors} from '../theme';
import EntryList from '../components/entries/EntryList';
import EntryListItem from '../components/entries/EntryListItem';
import DaySummaryCard from '../components/day/DaySummaryCard';
import DaySplitBar from '../components/day/DaySplitBar';
import FAB from '../components/ui/FAB';
import {buildQuickAddActions} from '../components/entries/quickAddActions';
import type {TabScreenProps} from '../navigation/navigationTypes';
import type {Entry} from '../types';
import {getUpcomingTodos} from '../db/entries';
import {formatDate, todayDate, nextDayDates} from '../utils/dateUtils';
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
  });

export default function HomeScreen({navigation}: Props) {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {today, loadToday, updateDayTimes} = useDayStore();
  const {entriesByDay, loadEntriesForDay} = useEntryStore();
  const [upcoming, setUpcoming] = useState<Entry[]>([]);

  const date = todayDate();
  const entries = today ? (entriesByDay[today.id] ?? []) : [];
  const totalSecs = today ? calcDayWorkSecs(today, entries) : 0;

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => {
    if (today) { loadEntriesForDay(today.id); }
  }, [today, loadEntriesForDay]);

  const loadUpcoming = useCallback(() => {
    getUpcomingTodos(nextDayDates()).then(setUpcoming).catch(() => {});
  }, []);
  useEffect(() => {
    loadUpcoming();
    const unsub = navigation.addListener('focus', loadUpcoming);
    return unsub;
  }, [navigation, loadUpcoming]);

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

  const openAddEntry = () => {
    if (!today) { return; }
    navigation.navigate('AddEntryModal', {date, dayId: today.id});
  };

  const quickActions = today
    ? buildQuickAddActions(entryType =>
        navigation.navigate('QuickAddModal', {date, dayId: today.id, entryType}),
      )
    : undefined;

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
          {format(new Date(), 'EEEE, MMMM d, yyyy', {
            locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
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
        {today && <DaySplitBar entries={entries} />}
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
        {upcoming.length > 0 && (
          <View style={styles.comingUp}>
            <Text style={styles.comingUpHeader}>{t('todo.comingUp')}</Text>
            {upcomingGroups.map(group => (
              <View key={group.date}>
                <Text style={styles.comingUpDate}>{formatDate(group.date)}</Text>
                {group.items.map(e => (
                  <EntryListItem
                    key={e.id}
                    entry={e}
                    onPress={() =>
                      navigation.navigate('EntryDetailScreen', {entryId: e.id, dayId: e.day_id})
                    }
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <FAB onPress={openAddEntry} actions={quickActions} />
    </SafeAreaView>
  );
}
