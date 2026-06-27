import React, {useMemo} from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {usePressAnimation} from './usePressAnimation';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    base: {
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {backgroundColor: c.primary},
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    ghost: {backgroundColor: 'transparent'},
    danger: {backgroundColor: c.error},
    disabled: {opacity: 0.45},
    text: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.bold,
    },
    primaryText: {color: c.white},
    secondaryText: {color: c.primary},
    ghostText: {color: c.textSecondary},
    dangerText: {color: c.white},
  });

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();
  const isOff = disabled || loading;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[styles.base, styles[variant], isOff && styles.disabled, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isOff}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? colors.white : colors.primary}
            size="small"
          />
        ) : (
          <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles] as any]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
