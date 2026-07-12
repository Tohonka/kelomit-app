import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps, NavigatorScreenParams} from '@react-navigation/native';
import type {EntryType} from '../types';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  DayScreen: {date: string};
  DayMap: {dayId: number; date: string};
  DayMapFull: {dayId: number; date: string};
  EntryDetailScreen: {entryId: number; dayId: number};
  AddEntryModal: {date?: string; dayId: number; entryId?: number};
  QuickAddModal: {date?: string; dayId: number; entryType: EntryType};
  ProjectsScreen: undefined;
  TagsScreen: undefined;
  TagsProjectsSettings: undefined;
  SearchScreen: undefined;
  InterfaceSettings: undefined;
  TrackingSettings: undefined;
  WorkDetailsSettings: undefined;
  DataSettings: undefined;
  QuickAddSettings: undefined;
  LocationSettings: undefined;
  WidgetSettings: undefined;
  TranscriptionSettings: undefined;
  DiagnosticsSettings: undefined;
};

export type TabParamList = {
  Home: undefined;
  Map: undefined;
  Data: undefined;
  Gallery: undefined;
  Calendar: undefined;
  Settings: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
