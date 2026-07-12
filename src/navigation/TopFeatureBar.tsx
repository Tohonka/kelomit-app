import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useTheme, typography} from '../theme';
import type {Colors} from '../theme';

// "Major features" — the growth surface. Add new circles here as the app grows.
const FEATURES: {route: string; labelKey: string; icon: string}[] = [
  {route: 'Home', labelKey: 'navigation.home', icon: 'home-variant'},
  {route: 'Map', labelKey: 'dayMap.title', icon: 'map-marker-outline'},
  {route: 'Data', labelKey: 'navigation.data', icon: 'chart-box-outline'},
  {route: 'Gallery', labelKey: 'navigation.gallery', icon: 'image-multiple-outline'},
  // Search lives in the root stack; navigate() bubbles up to it. It's never an
  // active tab, so it just never highlights — fine until it moves to the day header.
  {route: 'SearchScreen', labelKey: 'navigation.search', icon: 'magnify'},
];

const CIRCLE = 52;

const makeStyles = (c: Colors, top: number) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 5,
      paddingTop: top + 8,
      paddingBottom: 12,
      backgroundColor: c.glassTopBar,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.glassBorder,
    },
    row: {paddingHorizontal: 16, gap: 18, flexDirection: 'row'},
    item: {alignItems: 'center', gap: 6, width: CIRCLE + 8},
    circle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.swatch,
    },
    circleActive: {backgroundColor: c.primary},
    halo: {
      position: 'absolute',
      top: -7,
      left: -7,
      width: CIRCLE + 14,
      height: CIRCLE + 14,
      borderRadius: (CIRCLE + 14) / 2,
      backgroundColor: c.primary,
      opacity: 0.22,
    },
    label: {fontSize: 11, fontWeight: typography.weights.medium, color: c.textMuted},
    labelActive: {color: c.primary, fontWeight: typography.weights.bold},
    soonCircle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.textMuted,
    },
    soonItem: {alignItems: 'center', gap: 6, width: CIRCLE + 8, opacity: 0.45},
  });

export default function TopFeatureBar({state, navigation}: BottomTabBarProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  const active = state.routes[state.index].name;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {FEATURES.map(f => {
          const isActive = active === f.route;
          return (
            <TouchableOpacity
              key={f.route}
              style={styles.item}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(f.route)}>
              <View>
                {isActive && <View style={styles.halo} />}
                <View style={[styles.circle, isActive && styles.circleActive]}>
                  <Icon
                    name={f.icon}
                    size={24}
                    color={isActive ? colors.white : colors.textSecondary}
                  />
                </View>
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {t(f.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={styles.soonItem}>
          <View style={styles.soonCircle}>
            <Icon name="plus" size={16} color={colors.textMuted} />
          </View>
          <Text style={styles.label}>{t('navigation.soon')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
