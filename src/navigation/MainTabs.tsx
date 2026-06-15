import React from 'react';
import {useTranslation} from 'react-i18next';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CustomTabBar from './CustomTabBar';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import {useTheme, typography} from '../theme';
import type {TabParamList} from './navigationTypes';

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  return (
    <Tab.Navigator
      tabBar={tabBarProps => <CustomTabBar {...tabBarProps} />}
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
        },
        tabBarIcon: ({color, size}) => {
          const icons: Record<string, string> = {
            Home: 'home-variant',
            Calendar: 'calendar-month',
            Settings: 'cog',
          };
          return <Icon name={icons[route.name] ?? 'circle'} size={size} color={color} />;
        },
      })}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{tabBarLabel: t('navigation.home')}}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{tabBarLabel: t('navigation.calendar')}}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{tabBarLabel: t('common.settings')}}
      />
    </Tab.Navigator>
  );
}
