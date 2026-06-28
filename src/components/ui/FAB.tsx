import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, radius, spacing} from '../../theme';
import type {Colors} from '../../theme';
import Bounceable from './Bounceable';

export interface FabAction {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
}

interface Props {
  onPress: () => void;
  label?: string;
  actions?: FabAction[];
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.25,
      shadowOffset: {width: 0, height: 4},
      shadowRadius: 8,
      elevation: 6,
    },
    glowRing: {
      position: 'absolute',
      bottom: 24 - 4,
      right: 24 - 4,
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: c.primary,
    },
    label: {color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '400'},
    backdrop: {...StyleSheet.absoluteFill, backgroundColor: '#00000055'},
    dialWrap: {position: 'absolute', bottom: 24 + 64 + 16, right: 24, alignItems: 'flex-end', gap: spacing.md},
    actionRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    actionLabel: {
      backgroundColor: c.bgCard,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      shadowColor: c.shadow,
      shadowOpacity: 0.18,
      shadowOffset: {width: 0, height: 2},
      shadowRadius: 4,
      elevation: 3,
    },
    actionLabelText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    actionBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.2,
      shadowOffset: {width: 0, height: 2},
      shadowRadius: 5,
      elevation: 4,
    },
  });

export default function FAB({onPress, label = '+', actions}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const hasActions = !!actions && actions.length > 0;

  // Glow ring pulse: 0.3↔0.6 over ~2s
  const glowOpacity = useSharedValue(0.3);
  React.useEffect(() => {
    glowOpacity.value = withRepeat(
      withTiming(0.6, {duration: 1000, easing: Easing.inOut(Easing.quad)}),
      -1,
      true,
    );
  }, [glowOpacity]);
  const glowStyle = useAnimatedStyle(() => ({opacity: glowOpacity.value}));

  // Rotate "+" toward "×" when expanded
  const rot = useSharedValue(0);
  React.useEffect(() => {
    rot.value = withTiming(expanded ? 1 : 0, {duration: 180});
  }, [expanded, rot]);
  const labelAnimStyle = useAnimatedStyle(() => ({
    transform: [{rotate: `${interpolate(rot.value, [0, 1], [0, 45])}deg`}],
  }));

  const runAction = (action: FabAction) => {
    setExpanded(false);
    action.onPress();
  };

  return (
    <>
      {/* Dial backdrop + actions live in the same coordinate space as the FAB
          (no full-screen Modal) so the morphing +/× button stays put above the
          bottom nav instead of the close button dropping to the screen edge. */}
      {expanded && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} />
          <View style={styles.dialWrap} pointerEvents="box-none">
            {actions!.map((a, i) => (
              <Animated.View key={a.key} entering={FadeInDown.delay(i * 40).springify()} style={styles.actionRow}>
                <View style={styles.actionLabel}>
                  <Text style={styles.actionLabelText}>{a.label}</Text>
                </View>
                <Bounceable style={styles.actionBtn} onPress={() => runAction(a)}>
                  <Icon name={a.icon} size={24} color={colors.primary} />
                </Bounceable>
              </Animated.View>
            ))}
          </View>
        </>
      )}

      {/* Glow ring behind FAB */}
      <Animated.View style={[styles.glowRing, glowStyle]} pointerEvents="none" />

      <TouchableOpacity
        style={styles.fab}
        onPress={expanded ? () => setExpanded(false) : onPress}
        onLongPress={hasActions ? () => setExpanded(true) : undefined}
        delayLongPress={300}
        activeOpacity={0.8}>
        <Animated.Text style={[styles.label, labelAnimStyle]}>{label}</Animated.Text>
      </TouchableOpacity>
    </>
  );
}
