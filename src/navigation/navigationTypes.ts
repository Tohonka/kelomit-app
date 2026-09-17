import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps, NavigatorScreenParams} from '@react-navigation/native';
import type {EntryType, FoodUnit} from '../types';

/** What "duplicate & tweak" / a recents chip carries into the food editor. */
export interface FoodPrefill {
  name: string;
  kcal: number | null;
  product_id: number | null;
  quantity: number | null;
  unit: FoodUnit | null;
}

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  DayMap: {dayId: number; date: string};
  DayMapFull: {dayId: number; date: string};
  EntryDetailScreen: {entryId: number; dayId: number};
  AddEntryModal: {
    date?: string;
    dayId: number;
    entryId?: number;
    leaveRangeId?: number;
    initialTab?: 'note' | 'leave';
    prefill?: {body?: string; timeFrom?: string; timeTo?: string};
    /** Create mode only: the new note becomes a subnote of this entry. */
    parentId?: number;
  };
  QuickAddModal: {date?: string; dayId: number; entryType: EntryType; autoCapture?: boolean};
  /** Food log editor: `entryId` edits, `prefill` seeds a new entry, `date`
   *  picks the day for a new entry (default today). */
  FoodEntryModal:
    | {date?: string; entryId?: number; prefill?: FoodPrefill; scan?: boolean; /** already scanned (food widget) */ barcode?: string}
    | undefined;
  /** Pull-up user drawer behind the pill's Me slot; Settings lives inside it. */
  ProfileDrawer: undefined;
  ProjectsScreen: undefined;
  TagsScreen: undefined;
  TagsProjectsSettings: undefined;
  SearchScreen: undefined;
  InterfaceSettings: undefined;
  TrackingSettings: undefined;
  HealthSettings: undefined;
  WorkDetailsSettings: undefined;
  ReportingSettings: undefined;
  DataSettings: undefined;
  QuickAddSettings: undefined;
  LocationSettings: undefined;
  PlacesSettings: undefined;
  WidgetSettings: undefined;
  WidgetEdit: {appWidgetId: number};
  TranscriptionSettings: undefined;
  DiagnosticsSettings: undefined;
  HabitEditModal: {mode: 'category' | 'habit'; categoryId?: number; habitId?: number};
};

export type TabParamList = {
  /** Home shows any day; `date` asks it to jump to one (Calendar). */
  Home: {date?: string} | undefined;
  Map: undefined;
  Data: undefined;
  Gallery: undefined;
  Habits: undefined;
  /** `myFoods` opens the searchable my-foods sheet (food widget search icon). */
  Food: {myFoods?: boolean} | undefined;
  Calendar: undefined;
  Settings: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
