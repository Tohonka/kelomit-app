import React from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import TopFeatureBar from './TopFeatureBar';
import BottomPill, {type PillRoute} from './BottomPill';

// Rendered as the tab navigator's tabBar. Both bars are absolutely positioned,
// so this reserves no layout height — the scene fills the screen and the bars
// float over it. Day-detail is a root-stack push that covers these bars and
// renders its own pill, so no per-screen hiding is needed here.
export default function NavShell(props: BottomTabBarProps) {
  const {state, navigation} = props;
  const active = state.routes[state.index].name as PillRoute;
  return (
    <>
      <TopFeatureBar {...props} />
      <BottomPill active={active} onSelect={route => navigation.navigate(route)} />
    </>
  );
}
