import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {BottomTabBar} from '@react-navigation/bottom-tabs';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';

type SecondaryRoute = 'SearchScreen' | 'InsightsScreen';

const SECONDARY: {route: SecondaryRoute; labelKey: string; icon: string}[] = [
  {route: 'SearchScreen', labelKey: 'navigation.search', icon: 'magnify'},
  {route: 'InsightsScreen', labelKey: 'navigation.insights', icon: 'chart-box-outline'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {backgroundColor: c.bgCard},
    handleRow: {alignItems: 'center', paddingTop: 6},
    grabber: {width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 3},
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
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const go = (route: SecondaryRoute) => {
    setExpanded(false);
    props.navigation.navigate(route);
  };

  // Deliberate ~300ms hold + pull reveals the menu; a quick tap never opens it
  // (so the bar isn't triggered by accident). Tapping while open collapses it.
  const gesture = useMemo(() => {
    const pull = Gesture.Pan()
      .activateAfterLongPress(300)
      .runOnJS(true)
      .onUpdate(e => {
        if (e.translationY <= -12) { setExpanded(true); }
        else if (e.translationY >= 12) { setExpanded(false); }
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => { if (expanded) { setExpanded(false); } });
    return Gesture.Race(tap, pull);
  }, [expanded]);

  return (
    <View style={styles.wrap}>
      {expanded && (
        <View style={styles.secondaryRow}>
          {SECONDARY.map(s => (
            <TouchableOpacity key={s.route} style={styles.secondaryBtn} onPress={() => go(s.route)} activeOpacity={0.7}>
              <Icon name={s.icon} size={20} color={colors.primary} />
              <Text style={styles.secondaryText}>{t(s.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <View style={styles.handleRow}>
          <View style={styles.grabber} />
          <View style={styles.handle}>
            <Icon name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={colors.textMuted} />
            <Text style={styles.handleText}>{expanded ? t('fab.less') : t('fab.more')}</Text>
          </View>
        </View>
      </GestureDetector>

      <View style={styles.divider} />
      <BottomTabBar {...props} />
    </View>
  );
}
