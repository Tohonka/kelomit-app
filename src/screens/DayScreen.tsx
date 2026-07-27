import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, StyleSheet, TouchableOpacity} from 'react-native';
import {format} from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DayView from '../components/day/DayView';
import BottomPill from '../navigation/BottomPill';
import {useTheme, spacing} from '../theme';
import type {Colors} from '../theme';
import {getDateFnsLocale} from '../i18n';
import type {Day} from '../types';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'DayScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    headerRight: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: spacing.md},
  });

export default function DayScreen({navigation, route}: Props) {
  const {i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [currentDate, setCurrentDate] = useState(route.params.date);
  const [day, setDay] = useState<Day | null>(null);

  useEffect(() => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const label = format(new Date(y, m - 1, d), 'EEE d MMM', {
      locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en'),
    });
    navigation.setOptions({
      title: label,
      headerRight: () =>
        day ? (
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('DayMap', {dayId: day.id, date: currentDate})}
              hitSlop={8}>
              <Icon name="map-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null,
    });
  }, [currentDate, day, navigation, colors.primary, i18n.resolvedLanguage, styles.headerRight]);

  return (
    <View style={styles.container}>
      <DayView
        variant="detail"
        date={currentDate}
        onRequestDate={setCurrentDate}
        onOpenEntry={entry => navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})}
        onOpenLeave={range => day && navigation.navigate('AddEntryModal', {
          dayId: day.id,
          date: currentDate,
          leaveRangeId: range.id,
        })}
        onDayLoaded={setDay}
      />
      {/* Keep the floating pill present on the day screen too. Its + adds to the
          viewed day; the tabs pop back to MainTabs and switch. */}
      <BottomPill
        active={null}
        onSelect={pillRoute => navigation.navigate('MainTabs', {screen: pillRoute})}
        quickAddTarget={day ? {date: currentDate, dayId: day.id} : undefined}
      />
    </View>
  );
}
