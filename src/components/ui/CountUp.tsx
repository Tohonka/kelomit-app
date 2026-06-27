import React, {useEffect, useState} from 'react';
import {Text, type TextStyle, type StyleProp} from 'react-native';
import {
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {countUpValue} from '../../utils/countUp';

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  durationMs?: number;
  format?: (n: number) => string;
}

export default function CountUp({value, style, durationMs = 600, format}: Props) {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {duration: durationMs, easing: Easing.out(Easing.cubic)});
  }, [value, durationMs, progress]);

  useAnimatedReaction(
    () => countUpValue(progress.value, value),
    current => runOnJS(setDisplay)(current),
  );

  return <Text style={style}>{format ? format(display) : String(display)}</Text>;
}
