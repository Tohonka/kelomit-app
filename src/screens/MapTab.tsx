import React, {useEffect} from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDayStore} from '../store/dayStore';
import {useTheme} from '../theme';
import {useShellPadding} from '../navigation/shellMetrics';
import {DayMapView} from './DayMapScreen';
import type {RootStackParamList} from '../navigation/navigationTypes';

// "Map" major-feature tab = today's map. Resolves today's day, then reuses the
// shared DayMapView. Viewing a past day's map still goes through the DayMap route.
export default function MapTab() {
  const {colors} = useTheme();
  const shellPad = useShellPadding();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useDayStore(s => s.today);
  const loadToday = useDayStore(s => s.loadToday);

  useEffect(() => {
    if (!today) { loadToday(); }
  }, [today, loadToday]);

  if (!today) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <DayMapView
      dayId={today.id}
      topInset={shellPad.paddingTop}
      onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: today.id})}
    />
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
});
