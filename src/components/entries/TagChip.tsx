import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  name: string;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.bgMuted,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: spacing.xs,
      marginBottom: spacing.xs,
    },
    label: {
      color: c.textSecondary,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.medium,
    },
  });

export default function TagChip({name}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.chip}>
      <Text style={styles.label}>#{name}</Text>
    </View>
  );
}
