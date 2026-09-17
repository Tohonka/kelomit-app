import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, StyleSheet, Pressable, BackHandler, useWindowDimensions} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Bounceable from '../components/ui/Bounceable';
import {getSetting, setSetting} from '../db/settings';
import {haptic, HAPTIC_START, HAPTIC_TAP} from '../utils/haptics';
import {applyFeatureOrder, cellIndexAt, moveItem, parseFeatureOrder} from './featureOrder';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useTheme, typography} from '../theme';
import type {Colors} from '../theme';

// "Major features" — the growth surface. Add new circles here as the app grows.
const FEATURES: {route: string; labelKey: string; icon: string}[] = [
  {route: 'Home', labelKey: 'navigation.home', icon: 'home-variant'},
  {route: 'Map', labelKey: 'dayMap.title', icon: 'map-marker-outline'},
  // Route name stays 'Data'; the tab is "Balance" to the user (plan 2026-09-14 B1).
  {route: 'Data', labelKey: 'navigation.data', icon: 'scale-balance'},
  {route: 'Gallery', labelKey: 'navigation.gallery', icon: 'image-multiple-outline'},
  // Search lives in the root stack; navigate() bubbles up to it. It's never an
  // active tab, so it just never highlights — fine until it moves to the day header.
  {route: 'SearchScreen', labelKey: 'navigation.search', icon: 'magnify'},
  {route: 'Habits', labelKey: 'habits.title', icon: 'checkbox-marked-circle-outline'},
  {route: 'Food', labelKey: 'food.title', icon: 'silverware-fork-knife'},
];

type Feature = (typeof FEATURES)[number];

const CIRCLE = 52;
const ORDER_SETTING = 'feature_order';
// Order-mode grid cell: a circle + label, with the row's 18 px gap folded in.
const CELL_W = CIRCLE + 8 + 18;
const CELL_H = CIRCLE + 40;
const GRID_PAD = 16;

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
    // Order mode: a full-screen scrim with every circle laid out in a grid.
    scrim: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, backgroundColor: '#000000AA'},
    panel: {
      paddingTop: top + 8,
      paddingBottom: 16,
      paddingHorizontal: GRID_PAD,
      backgroundColor: c.bgCard,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.glassBorder,
    },
    panelHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
    panelTitle: {fontSize: typography.sizes.sm, color: c.textMuted},
    done: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: c.primary},
    doneText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: c.white},
    cell: {position: 'absolute', left: 0, top: 0, width: CELL_W, height: CELL_H, alignItems: 'center', gap: 6},
  });

type Styles = ReturnType<typeof makeStyles>;

interface CellProps {
  feature: Feature;
  index: number;
  cols: number;
  label: string;
  styles: Styles;
  iconColor: string;
  onDragTo: (route: string, x: number, y: number) => void;
  onDrop: () => void;
}

/** One draggable circle of the order grid. The gesture runs on the JS thread
 *  (house pattern) — seven items don't need worklets, and it keeps the
 *  reorder logic in plain, testable functions. */
function SortableCell({feature, index, cols, label, styles, iconColor, onDragTo, onDrop}: CellProps) {
  const homeX = (index % cols) * CELL_W;
  const homeY = Math.floor(index / cols) * CELL_H;
  const x = useSharedValue(homeX);
  const y = useSharedValue(homeY);
  const lift = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const dragging = useRef(false);
  const start = useRef({x: 0, y: 0});
  // A ref, so the gesture object stays the same while the order changes under it.
  const home = useRef({x: homeX, y: homeY});
  home.current = {x: homeX, y: homeY};

  useEffect(() => {
    wiggle.value = withRepeat(withSequence(withTiming(-2, {duration: 110}), withTiming(2, {duration: 110})), -1, true);
    return () => cancelAnimation(wiggle);
  }, [wiggle]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart(() => {
          dragging.current = true;
          start.current = home.current;
          lift.value = withTiming(1, {duration: 120});
          haptic(HAPTIC_TAP);
        })
        .onUpdate(e => {
          // Locals, not x.value: reading a shared value back on the JS thread
          // right after writing it can return the previous frame's number.
          const nx = start.current.x + e.translationX;
          const ny = start.current.y + e.translationY;
          x.value = nx;
          y.value = ny;
          onDragTo(feature.route, nx, ny);
        })
        .onFinalize(() => {
          if (!dragging.current) { return; }
          dragging.current = false;
          lift.value = withTiming(0, {duration: 120});
          onDrop();
        }),
    [feature.route, lift, onDragTo, onDrop, x, y],
  );

  // Neighbours slide to their new cell; the dragged one follows the finger and
  // settles on the re-render its drop triggers. Runs every render on purpose: a
  // drop back onto the same cell changes no prop.
  useEffect(() => {
    if (!dragging.current) {
      x.value = withTiming(homeX, {duration: 160});
      y.value = withTiming(homeY, {duration: 160});
    }
  });

  const animated = useAnimatedStyle(() => ({
    transform: [
      {translateX: x.value},
      {translateY: y.value},
      {rotate: `${lift.value > 0 ? 0 : wiggle.value}deg`},
      {scale: 1 + lift.value * 0.12},
    ],
    zIndex: lift.value > 0 ? 10 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.cell, animated]} accessibilityLabel={label}>
        <View style={styles.circle}>
          <Icon name={feature.icon} size={24} color={iconColor} />
        </View>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export default function TopFeatureBar({state, navigation}: BottomTabBarProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  const active = state.routes[state.index].name;
  const {width} = useWindowDimensions();
  const [order, setOrder] = useState<string[]>(() => FEATURES.map(f => f.route));
  const [editing, setEditing] = useState(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    getSetting(ORDER_SETTING)
      .then(raw => setOrder(applyFeatureOrder(parseFeatureOrder(raw), FEATURES.map(f => f.route))))
      .catch(() => {});
  }, []);

  const features = useMemo(
    () => order.map(r => FEATURES.find(f => f.route === r)).filter((f): f is Feature => f != null),
    [order],
  );
  const cols = Math.max(1, Math.floor((width - GRID_PAD * 2) / CELL_W));
  const rows = Math.ceil(features.length / cols);

  const finish = useCallback(() => {
    setEditing(false);
    setSetting(ORDER_SETTING, JSON.stringify(orderRef.current)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) { return; }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [editing, finish]);

  const onDragTo = useCallback((route: string, x: number, y: number) => {
    const current = orderRef.current;
    const from = current.indexOf(route);
    const to = cellIndexAt(x, y, CELL_W, CELL_H, cols, current.length);
    if (from >= 0 && to !== from) {
      haptic(HAPTIC_TAP);
      setOrder(moveItem(current, from, to));
    }
  }, [cols]);

  // A drop needs no bookkeeping: the order already moved while dragging.
  const onDrop = useCallback(() => setOrder(o => [...o]), []);

  if (editing) {
    return (
      <Pressable style={styles.scrim} onPress={finish} accessibilityLabel={t('common.done')}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{t('navigation.reorderHint')}</Text>
            <Pressable style={styles.done} onPress={finish} accessibilityRole="button">
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </Pressable>
          </View>
          <View style={{height: rows * CELL_H}}>
            {/* Fixed render order: only `index` moves, so no native view is
                re-parented under the finger mid-drag. */}
            {FEATURES.map(f => (
              <SortableCell
                key={f.route}
                feature={f}
                index={order.indexOf(f.route)}
                cols={cols}
                label={t(f.labelKey)}
                styles={styles}
                iconColor={colors.textSecondary}
                onDragTo={onDragTo}
                onDrop={onDrop}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {features.map(f => {
          const isActive = active === f.route;
          return (
            <Bounceable
              key={f.route}
              style={styles.item}
              haptic
              accessibilityLabel={t(f.labelKey)}
              delayLongPress={450}
              onLongPress={() => {
                haptic(HAPTIC_START);
                setEditing(true);
              }}
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
            </Bounceable>
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
