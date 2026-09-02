import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import NavShell from './NavShell';
import HomeScreen from '../screens/HomeScreen';
import MapTab from '../screens/MapTab';
import InsightsScreen from '../screens/InsightsScreen';
import GalleryScreen from '../screens/GalleryScreen';
import HabitsScreen from '../screens/HabitsScreen';
import CalendarScreen from '../screens/CalendarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type {TabParamList} from './navigationTypes';

const Tab = createBottomTabNavigator<TabParamList>();

// Destinations of the new nav shell. The top "major features" bar surfaces
// Home/Map/Data/Gallery; the floaty bottom pill surfaces Home/Calendar/Settings
// plus quick-add. Both bars are drawn by NavShell (the custom tabBar).
export default function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <NavShell {...props} />}
      screenOptions={{headerShown: false, lazy: true}}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Map" component={MapTab} />
      <Tab.Screen name="Data" component={InsightsScreen} />
      <Tab.Screen name="Gallery" component={GalleryScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
