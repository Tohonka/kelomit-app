import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {EntryType} from '../types';

export type RootStackParamList = {
  MainTabs: undefined;
  DayScreen: {date: string};
  EntryDetailScreen: {entryId: number; dayId: number};
  AddEntryModal: {date?: string; dayId: number; entryId?: number};
  QuickAddModal: {date?: string; dayId: number; entryType: EntryType};
  ProjectsScreen: undefined;
  SearchScreen: undefined;
  InsightsScreen: undefined;
  InterfaceSettings: undefined;
  TrackingSettings: undefined;
  DataSettings: undefined;
  QuickAddSettings: undefined;
  LocationSettings: undefined;
};

export type TabParamList = {
  Home: undefined;
  Calendar: undefined;
  Settings: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
