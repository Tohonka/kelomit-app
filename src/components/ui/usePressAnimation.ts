import {useSharedValue, useAnimatedStyle, withSpring} from 'react-native-reanimated';

// Spec spring press-state: in → 0.94, out → overshoot 1.04 → settle 1.0.
const SPRING = {damping: 12, stiffness: 320, mass: 0.5};

export function usePressAnimation() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.94, SPRING);
  };
  const onPressOut = () => {
    // Overshoot then settle — withSpring naturally overshoots to ~1.04 from 0.94
    // with this config; target 1 and let the spring carry past it.
    scale.value = withSpring(1, {damping: 9, stiffness: 260, mass: 0.5});
  };

  return {animatedStyle, onPressIn, onPressOut};
}
