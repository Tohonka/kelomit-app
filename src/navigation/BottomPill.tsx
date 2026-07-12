import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useTheme, typography, radius} from '../theme';
import type {Colors} from '../theme';
import QuickAddButton from './QuickAddButton';

// The 3 everyday destinations + quick-add. Always in reach, floats over content.
const makeStyles = (c: Colors, bottom: number) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: Math.max(bottom, 10) + 12,
      alignItems: 'center',
      zIndex: 40,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: radius.bar,
      backgroundColor: c.glassPill,
      borderWidth: 1,
      borderColor: c.glassHighlight,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowOffset: {width: 0, height: 10},
      shadowRadius: 28,
      elevation: 14,
    },
    tab: {width: 60, alignItems: 'center', gap: 3, paddingVertical: 6},
    label: {fontSize: 10, fontWeight: typography.weights.semibold},
  });

export default function BottomPill({state, navigation}: BottomTabBarProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);
  const active = state.routes[state.index].name;

  const tab = (route: string, labelKey: string, icon: string) => {
    const isActive = active === route;
    const color = isActive ? colors.primary : colors.textMuted;
    return (
      <TouchableOpacity
        style={styles.tab}
        activeOpacity={0.7}
        onPress={() => navigation.navigate(route)}>
        <Icon name={icon} size={20} color={color} />
        <Text style={[styles.label, {color}]}>{t(labelKey)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pill}>
        {tab('Home', 'navigation.home', 'home-variant')}
        {tab('Calendar', 'navigation.calendar', 'calendar-month')}
        <QuickAddButton />
        {tab('Settings', 'common.settings', 'cog-outline')}
      </View>
    </View>
  );
}
