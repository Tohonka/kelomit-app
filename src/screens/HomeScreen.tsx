import React from 'react';
import DayView from '../components/day/DayView';
import {todayDate} from '../utils/dateUtils';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Home'>;

export default function HomeScreen({navigation}: Props) {
  const date = todayDate();
  return (
    <DayView
      variant="today"
      date={date}
      onRequestDate={d => navigation.navigate('DayScreen', {date: d})}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
    />
  );
}
