import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import DayView from '../components/day/DayView';
import {useDayStore} from '../store/dayStore';
import {useEntryStore} from '../store/entryStore';
import {todayDate} from '../utils/dateUtils';
import type {Day} from '../types';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Home'>;

/** The one day screen. Home owns the viewed date: swipe/chevrons move it, the
 *  Home pill re-press and a new calendar day pull it back to today, Calendar
 *  hands in a date via route params. The nav shell stays put on every date. */
export default function HomeScreen({navigation, route}: Props) {
  const [date, setDate] = useState(todayDate());
  const [day, setDay] = useState<Day | null>(null);
  const loadToday = useDayStore(s => s.loadToday);
  const loadEntriesForDay = useEntryStore(s => s.loadEntriesForDay);
  // True while the user is "following today" — only then may foregrounding move the date.
  const followingToday = useRef(true);
  useEffect(() => { followingToday.current = date === todayDate(); }, [date]);

  const jumpToToday = useCallback(async () => {
    const today = await loadToday(); // prefill + midnight rollover live here
    setDate(today.date);
    await loadEntriesForDay(today.id);
  }, [loadToday, loadEntriesForDay]);

  // Calendar (or anything else) asked for a specific day. Consume + clear the
  // param so the same date can be requested again and it never overrides a
  // later tab re-press.
  useEffect(() => {
    if (route.params?.date) {
      setDate(route.params.date);
      navigation.setParams({date: undefined});
    }
  }, [route.params?.date, navigation]);

  // Re-pressing the Home pill while here = back to today.
  useEffect(() => navigation.addListener('tabPress', () => {
    if (navigation.isFocused()) { jumpToToday().catch(() => {}); }
  }), [navigation, jumpToToday]);

  // Foregrounding: follow the calendar if we were on today, else stay put.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && followingToday.current) { jumpToToday().catch(() => {}); }
    });
    return () => sub.remove();
  }, [jumpToToday]);

  // First mount only, and only when nobody asked for a specific day (tabs are
  // lazy, so a Calendar tap can be what mounts Home).
  useEffect(() => {
    if (!route.params?.date) { jumpToToday().catch(() => {}); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DayView
      date={date}
      onRequestDate={setDate}
      onDayLoaded={setDay}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
      onAddSubnote={entry => navigation.navigate('AddEntryModal', {dayId: entry.day_id, date, parentId: entry.id})}
      onOpenLeave={range => day && navigation.navigate('AddEntryModal', {dayId: day.id, date, leaveRangeId: range.id})}
      onOpenMap={() => day && navigation.navigate('DayMap', {dayId: day.id, date})}
    />
  );
}
