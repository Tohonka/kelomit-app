import React, {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import DayView from '../components/day/DayView';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {todayDate} from '../utils/dateUtils';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Home'>;

export default function HomeScreen({navigation}: Props) {
  const [date, setDate] = useState(todayDate());
  const loadToday = useDayStore(s => s.loadToday);
  const loadEntriesForDay = useEntryStore(s => s.loadEntriesForDay);
  const today = useDayStore(s => s.today);

  const refreshToday = useCallback(async () => {
    const day = await loadToday();
    setDate(day.date);
    await loadEntriesForDay(day.id);
  }, [loadToday, loadEntriesForDay]);

  useFocusEffect(
    useCallback(() => {
      refreshToday().catch(() => {});
    }, [refreshToday]),
  );

  useEffect(() => navigation.addListener('tabPress', () => {
    if (navigation.isFocused()) {
      refreshToday().catch(() => {});
    }
  }), [navigation, refreshToday]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refreshToday().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [refreshToday]);

  return (
    <DayView
      variant="today"
      date={date}
      onRequestDate={d => navigation.navigate('DayScreen', {date: d})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
      onAddSubnote={entry => navigation.navigate('AddEntryModal', {dayId: entry.day_id, date, parentId: entry.id})}
      onOpenLeave={range => today && navigation.navigate('AddEntryModal', {
        dayId: today.id,
        date,
        leaveRangeId: range.id,
      })}
    />
  );
}
