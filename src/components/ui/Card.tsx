import React, {useMemo} from 'react';
import {View, StyleSheet, type ViewStyle} from 'react-native';
import {useTheme, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      padding: spacing.lg,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowOffset: {width: 0, height: 2},
      shadowRadius: 6,
      elevation: 2,
    },
  });

export default function Card({children, style}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={[styles.card, style]}>{children}</View>;
}
