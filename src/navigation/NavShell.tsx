import React from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import TopFeatureBar from './TopFeatureBar';
import BottomPill from './BottomPill';

// Rendered as the tab navigator's tabBar. Both bars are absolutely positioned,
// so this reserves no layout height — the scene fills the screen and the bars
// float over it. Day-detail is a root-stack push that covers these bars, so no
// per-screen hiding is needed here.
export default function NavShell(props: BottomTabBarProps) {
  return (
    <>
      <TopFeatureBar {...props} />
      <BottomPill {...props} />
    </>
  );
}
