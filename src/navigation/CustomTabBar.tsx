import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {BottomTabBar} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';

type SecondaryRoute = 'SearchScreen' | 'InsightsScreen';

const SECONDARY: {route: SecondaryRoute; label: string; icon: string}[] = [
  {route: 'SearchScreen', label: 'Search', icon: 'magnify'},
  {route: 'InsightsScreen', label: 'Insights', icon: 'chart-box-outline'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {backgroundColor: c.bgCard},
    handleRow: {alignItems: 'center', paddingTop: 6},
    handle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 2,
    },
    handleText: {fontSize: typography.sizes.xs, color: c.textMuted, fontWeight: typography.weights.medium},
    secondaryRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
    },
    secondaryText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.semibold},
    divider: {height: 1, backgroundColor: c.border},
  });

export default function CustomTabBar(props: BottomTabBarProps) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const go = (route: SecondaryRoute) => {
    setExpanded(false);
    props.navigation.navigate(route);
  };

  return (
    <View style={styles.wrap}>
      {expanded && (
        <View style={styles.secondaryRow}>
          {SECONDARY.map(s => (
            <TouchableOpacity key={s.route} style={styles.secondaryBtn} onPress={() => go(s.route)} activeOpacity={0.7}>
              <Icon name={s.icon} size={20} color={colors.primary} />
              <Text style={styles.secondaryText}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.handleRow}>
        <TouchableOpacity
          style={styles.handle}
          onPress={() => setExpanded(e => !e)}
          hitSlop={{top: 8, bottom: 8, left: 24, right: 24}}
          activeOpacity={0.7}>
          <Icon name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textMuted} />
          <Text style={styles.handleText}>{expanded ? 'Less' : 'More'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />
      <BottomTabBar {...props} />
    </View>
  );
}
