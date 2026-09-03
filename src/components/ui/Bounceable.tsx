import React from 'react';
import {Pressable, type ViewStyle, type StyleProp} from 'react-native';
import Animated from 'react-native-reanimated';
import {usePressAnimation} from './usePressAnimation';
import {haptic as vibrate, HAPTIC_TAP} from '../../utils/haptics';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  delayLongPress?: number;
  accessibilityLabel?: string;
  /** Light tick on press. Off by default — list rows shouldn't buzz. */
  haptic?: boolean;
}

/** Spring-scale pressable (in → 0.94, out → overshoot → 1). The one wrapper for
 *  anything tappable that isn't a labelled Button. */
export default function Bounceable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  hitSlop,
  delayLongPress,
  accessibilityLabel,
  haptic = false,
}: Props) {
  const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress ? () => { if (haptic) { vibrate(HAPTIC_TAP); } onPress(); } : undefined}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
