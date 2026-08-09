import {createNavigationContainerRef} from '@react-navigation/native';
import type {RootStackParamList} from './navigationTypes';

/** Module-level ref so non-component code (deep links) can navigate. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
