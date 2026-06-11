import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import DayScreen from '../screens/DayScreen';
import EntryDetailScreen from '../screens/EntryDetailScreen';
import AddEntryModal from '../screens/AddEntryModal';
import ProjectsScreen from '../screens/ProjectsScreen';
import {colors} from '../theme';
import type {RootStackParamList} from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
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
        options={{
          title: 'Add Entry',
          presentation: 'modal',
          headerStyle: {backgroundColor: colors.bgCard},
        }}
      />
      <Stack.Screen
        name="ProjectsScreen"
        component={ProjectsScreen}
        options={{title: 'Projects'}}
      />
    </Stack.Navigator>
  );
}
