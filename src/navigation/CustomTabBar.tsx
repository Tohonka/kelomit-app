import React, {useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Animated, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
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
    // Clips the panel so it reveals/hides as its height animates.
    clip: {overflow: 'hidden'},
    // Absolute so the panel measures its natural height regardless of the
    // clip container's animated (sometimes 0) height.
    panelMeasure: {position: 'absolute', left: 0, right: 0, top: 0},
    handleRow: {alignItems: 'center', paddingTop: 6, paddingBottom: 4, minHeight: 44, justifyContent: 'center'},
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
  const [panelH, setPanelH] = useState(0);

  // 0 = closed, 1 = open. Drives the clip height. JS-driven because height
  // can't use the native driver — fine for a single small panel.
  const anim = useRef(new Animated.Value(0)).current;
  const progressRef = useRef(0); // last known 0..1, readable synchronously
  const startRef = useRef(0); // progress at gesture start
  const panelHRef = useRef(0); // panel height, readable inside gesture closure

  const settle = (to: number) => {
    progressRef.current = to;
    setExpanded(to === 1);
    Animated.spring(anim, {toValue: to, useNativeDriver: false, bounciness: 0, speed: 18}).start();
  };

  const go = (route: SecondaryRoute) => {
    settle(0);
    props.navigation.navigate(route);
  };

  // Tap = instant toggle. Pan = finger-following drag (notification-shade
  // feel) that snaps open/closed on release by position or velocity. activeOffsetY
  // means a still tap never starts a drag, so the two don't conflict.
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => settle(progressRef.current > 0.5 ? 0 : 1));

    const pan = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .runOnJS(true)
      .onBegin(() => {
        startRef.current = progressRef.current;
      })
      .onUpdate(e => {
        const h = panelHRef.current || 1;
        let p = startRef.current - e.translationY / h; // drag up → open
        p = Math.max(0, Math.min(1, p));
        progressRef.current = p;
        anim.setValue(p);
      })
      .onEnd(e => {
        let open: boolean;
        if (e.velocityY < -500) {
          open = true; // fling up
        } else if (e.velocityY > 500) {
          open = false; // fling down
        } else {
          open = progressRef.current > 0.5; // snap to nearest
        }
        settle(open ? 1 : 0);
      });

    return Gesture.Race(tap, pan);
    // refs keep this stable; no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clipHeight = useMemo(
    () => anim.interpolate({inputRange: [0, 1], outputRange: [0, Math.max(panelH, 1)]}),
    [anim, panelH],
  );

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.clip, {height: clipHeight, opacity: anim}]}>
        <View
          style={styles.panelMeasure}
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && h !== panelHRef.current) {
              panelHRef.current = h;
              setPanelH(h);
            }
          }}>
          <View style={styles.secondaryRow}>
            {SECONDARY.map(s => (
              <TouchableOpacity key={s.route} style={styles.secondaryBtn} onPress={() => go(s.route)} activeOpacity={0.7}>
                <Icon name={s.icon} size={20} color={colors.primary} />
                <Text style={styles.secondaryText}>{t(s.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <View
          style={styles.handleRow}
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('fab.less') : t('fab.more')}>
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
