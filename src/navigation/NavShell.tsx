import React from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import TopFeatureBar from './TopFeatureBar';
import BottomPill, {type PillRoute} from './BottomPill';
import {useDayStore} from '../store/dayStore';

// Rendered as the tab navigator's tabBar. Both bars are absolutely positioned,
// so this reserves no layout height — the scene fills the screen and the bars
// float over it. Home shows any day, so while it's active the + targets the
// day it is showing (dayStore.selectedDay, set by DayView's loadDay).
export default function NavShell(props: BottomTabBarProps) {
  const {state, navigation} = props;
  const active = state.routes[state.index].name as PillRoute;
  const selectedDay = useDayStore(s => s.selectedDay);
  const quickAddTarget = active === 'Home' && selectedDay
    ? {date: selectedDay.date, dayId: selectedDay.id}
    : undefined;
  const select = (name: PillRoute) => {
    const route = state.routes.find(candidate => candidate.name === name);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(name);
    }
  };
  return (
    <>
      <TopFeatureBar {...props} />
      <BottomPill active={active} onSelect={select} quickAddTarget={quickAddTarget} />
    </>
  );
}
