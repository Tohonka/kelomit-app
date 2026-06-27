import React from 'react';
import {Pressable, type ViewStyle, type StyleProp} from 'react-native';
import Animated from 'react-native-reanimated';
import {usePressAnimation} from './usePressAnimation';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  delayLongPress?: number;
}

export default function Bounceable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  hitSlop,
  delayLongPress,
}: Props) {
  const {animatedStyle, onPressIn, onPressOut} = usePressAnimation();
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
