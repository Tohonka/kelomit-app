import React from 'react';
import {useTranslation} from 'react-i18next';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MainTabs from './MainTabs';
import EntryDetailScreen from '../screens/EntryDetailScreen';
import AddEntryModal from '../screens/AddEntryModal';
import QuickAddModal from '../screens/QuickAddModal';
import ProjectsScreen from '../screens/ProjectsScreen';
import TagsScreen from '../screens/TagsScreen';
import TagsProjectsSettings from '../screens/settings/TagsProjectsSettings';
import SearchScreen from '../screens/SearchScreen';
import InterfaceSettings from '../screens/settings/InterfaceSettings';
import TrackingSettings from '../screens/settings/TrackingSettings';
import WorkDetailsSettings from '../screens/settings/WorkDetailsSettings';
import DataSettings from '../screens/settings/DataSettings';
import QuickAddSettings from '../screens/settings/QuickAddSettings';
import LocationSettings from '../screens/settings/LocationSettings';
import WidgetSettings from '../screens/settings/WidgetSettings';
import TranscriptionSettings from '../screens/settings/TranscriptionSettings';
import DiagnosticsSettings from '../screens/settings/DiagnosticsSettings';
import {useTheme} from '../theme';
import type {RootStackParamList} from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const {t} = useTranslation();
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
        name="EntryDetailScreen"
        component={EntryDetailScreen}
        options={{title: t('navigation.entry')}}
      />
      <Stack.Screen
        name="AddEntryModal"
        component={AddEntryModal}
        options={({route}) => ({
          title: route.params.entryId ? t('navigation.editEntry') : t('navigation.addEntry'),
          presentation: 'modal',
          headerStyle: {backgroundColor: colors.bgCard},
        })}
      />
      <Stack.Screen
        name="QuickAddModal"
        component={QuickAddModal}
        options={{
          title: t('navigation.quickAdd'),
          presentation: 'modal',
          headerStyle: {backgroundColor: colors.bgCard},
        }}
      />
      <Stack.Screen
        name="ProjectsScreen"
        component={ProjectsScreen}
        options={{title: t('common.projects')}}
      />
      <Stack.Screen
        name="TagsScreen"
        component={TagsScreen}
        options={{title: t('common.tags')}}
      />
      <Stack.Screen
        name="TagsProjectsSettings"
        component={TagsProjectsSettings}
        options={{title: t('manager.tagsProjectsTitle')}}
      />
      <Stack.Screen
        name="SearchScreen"
        component={SearchScreen}
        options={{title: t('navigation.search')}}
      />
      <Stack.Screen
        name="InterfaceSettings"
        component={InterfaceSettings}
        options={{title: t('navigation.interface')}}
      />
      <Stack.Screen
        name="TrackingSettings"
        component={TrackingSettings}
        options={{title: t('navigation.tracking')}}
      />
      <Stack.Screen
        name="WorkDetailsSettings"
        component={WorkDetailsSettings}
        options={{title: t('settings.workDetailsTitle')}}
      />
      <Stack.Screen
        name="DataSettings"
        component={DataSettings}
        options={{title: t('common.data')}}
      />
      <Stack.Screen
        name="QuickAddSettings"
        component={QuickAddSettings}
        options={{title: t('navigation.quickAdd')}}
      />
      <Stack.Screen
        name="LocationSettings"
        component={LocationSettings}
        options={{title: t('location.title')}}
      />
      <Stack.Screen
        name="WidgetSettings"
        component={WidgetSettings}
        options={{title: t('widgets.title')}}
      />
      <Stack.Screen
        name="TranscriptionSettings"
        component={TranscriptionSettings}
        options={{title: t('transcription.title')}}
      />
      <Stack.Screen
        name="DiagnosticsSettings"
        component={DiagnosticsSettings}
        options={{title: t('diagnostics.title')}}
      />
    </Stack.Navigator>
  );
}
