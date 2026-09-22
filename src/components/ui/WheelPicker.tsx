import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useTheme, typography, radius} from '../../theme';
import type {Colors} from '../../theme';
import {haptic, HAPTIC_TAP} from '../../utils/haptics';
import ActionSheet from './ActionSheet';

export interface WheelOption {
  key: string;
  label: string;
}

interface Props {
  options: WheelOption[];
  value: string;
  onChange: (key: string) => void;
  width?: number;
}

const ITEM_H = 34;
// ponytail: the loop is the option list repeated; the wheel re-centres itself
// whenever it settles, so the ends are unreachable in practice.
const REPEATS = 40;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {
      height: ITEM_H * 3,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      overflow: 'hidden',
    },
    pad: {paddingVertical: ITEM_H},
    item: {height: ITEM_H, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
    text: {fontSize: typography.sizes.sm, color: c.textMuted},
    textActive: {fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: c.textPrimary},
    band: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: ITEM_H,
      height: ITEM_H,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.primary,
      opacity: 0.6,
    },
  });

/** Looping vertical snap wheel, three rows tall; the middle row is the value. */
export default function WheelPicker({options, value, onChange, width = 124}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ref = useRef<ScrollView>(null);
  const n = options.length;
  const base = Math.floor(REPEATS / 2) * n;
  const valueIdx = Math.max(0, options.findIndex(o => o.key === value));
  const [row, setRow] = useState(base + valueIdx);
  const [listOpen, setListOpen] = useState(false);
  // Initial position only: a changing contentOffset prop makes Android scrollTo
  // immediately, which fights the snap animation.
  const initialOffset = useRef({x: 0, y: (base + valueIdx) * ITEM_H}).current;
  const items = useMemo(
    () => Array.from({length: n * REPEATS}, (_, i) => options[i % n]),
    [options, n],
  );

  // Follow a value set from outside (product linked, entry loaded) or a new
  // option list.
  useEffect(() => {
    if (n === 0 || row % n === valueIdx) { return; }
    const next = base + valueIdx;
    setRow(next);
    ref.current?.scrollTo({y: next * ITEM_H, animated: false});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIdx, n]);

  const select = (i: number) => {
    ref.current?.scrollTo({y: i * ITEM_H, animated: true});
    setRow(i);
    const o = options[((i % n) + n) % n];
    if (o.key !== value) { onChange(o.key); }
  };

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (n === 0) { return; }
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    // A slow release (no fling) never gets a momentum-end on Android and the
    // wheel would rest between rows: nudge it onto the nearest row ourselves.
    if (Math.abs(e.nativeEvent.contentOffset.y - i * ITEM_H) > 0.5) {
      ref.current?.scrollTo({y: i * ITEM_H, animated: true});
    }
    const idx = ((i % n) + n) % n;
    const centred = base + idx;
    if (Math.abs(i - centred) > n * 5) {
      ref.current?.scrollTo({y: centred * ITEM_H, animated: false});
      setRow(centred);
    } else {
      setRow(i);
    }
    if (options[idx].key !== value) {
      haptic(HAPTIC_TAP);
      onChange(options[idx].key);
    }
  };

  if (n === 0) { return null; }

  return (
    <View style={[styles.wrap, {width}]}>
      <ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        disableIntervalMomentum
        decelerationRate="fast"
        contentOffset={initialOffset}
        onLayout={() => ref.current?.scrollTo({y: row * ITEM_H, animated: false})}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={e => {
          const v = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(v) < 0.1) { settle(e); }
        }}
        contentContainerStyle={styles.pad}>
        {items.map((o, i) => (
          <Pressable
            key={i}
            style={styles.item}
            accessibilityLabel={o.label}
            onPress={() => {
              // Centre row = quick tap → plain list; other rows scroll-select
              // (a programmatic scroll emits no momentum-end on Android).
              if (i === row) { setListOpen(true); } else { select(i); }
            }}>
            <Text style={i === row ? styles.textActive : styles.text} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.band} pointerEvents="none" />
      <ActionSheet
        visible={listOpen}
        onClose={() => setListOpen(false)}
        actions={options.map((o, idx) => ({
          label: o.key === value ? `✓ ${o.label}` : o.label,
          onPress: () => select(base + idx),
        }))}
      />
    </View>
  );
}
