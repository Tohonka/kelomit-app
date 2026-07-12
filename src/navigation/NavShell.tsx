import React from 'react';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import TopFeatureBar from './TopFeatureBar';
import BottomPill from './BottomPill';

// Rendered as the tab navigator's tabBar. Both bars are absolutely positioned,
// so this component reserves no layout height — the scene fills the screen and
// the bars float over it (screens pad their content to clear both).
export default function NavShell(props: BottomTabBarProps) {
  const {state} = props;
  // Hide the shell on Home-stack detail screens (DayScreen, DayMap) so the
  // floating bars don't collide with those pushed screens' native headers.
  // All other detail screens live in the root stack and already cover the bars.
  const activeRoute = state.routes[state.index];
  const nested = activeRoute.state as {index?: number} | undefined;
  if (activeRoute.name === 'Home' && nested && (nested.index ?? 0) > 0) {
    return null;
  }
  return (
    <>
      <TopFeatureBar {...props} />
      <BottomPill {...props} />
    </>
  );
}
