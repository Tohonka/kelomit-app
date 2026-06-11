import React from 'react';
import {View, StyleSheet, type ViewStyle} from 'react-native';
import {colors, spacing, radius} from '../../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function Card({children, style}: Props) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 6,
    elevation: 2,
  },
});
