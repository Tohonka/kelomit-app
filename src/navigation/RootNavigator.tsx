import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import DayScreen from '../screens/DayScreen';
import EntryDetailScreen from '../screens/EntryDetailScreen';
import AddEntryModal from '../screens/AddEntryModal';
import ProjectsScreen from '../screens/ProjectsScreen';
import InterfaceSettings from '../screens/settings/InterfaceSettings';
import TrackingSettings from '../screens/settings/TrackingSettings';
import DataSettings from '../screens/settings/DataSettings';
import {useTheme} from '../theme';
import type {RootStackParamList} from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const {colors} = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.bgCard},
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {fontWeight: '600'},
        contentStyle: {backgroundColor: colors.bg},
      }}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="DayScreen"
        component={DayScreen}
        options={({route}) => ({title: route.params.date})}
      />
      <Stack.Screen
        name="EntryDetailScreen"
        component={EntryDetailScreen}
        options={{title: 'Entry'}}
      />
      <Stack.Screen
        name="AddEntryModal"
        component={AddEntryModal}
        options={({route}) => ({
          title: route.params.entryId ? 'Edit Entry' : 'Add Entry',
          presentation: 'modal',
          headerStyle: {backgroundColor: colors.bgCard},
        })}
      />
      <Stack.Screen
        name="ProjectsScreen"
        component={ProjectsScreen}
        options={{title: 'Projects'}}
      />
      <Stack.Screen
        name="InterfaceSettings"
        component={InterfaceSettings}
        options={{title: 'Interface'}}
      />
      <Stack.Screen
        name="TrackingSettings"
        component={TrackingSettings}
        options={{title: 'Tracking'}}
      />
      <Stack.Screen
        name="DataSettings"
        component={DataSettings}
        options={{title: 'Data'}}
      />
    </Stack.Navigator>
  );
}
