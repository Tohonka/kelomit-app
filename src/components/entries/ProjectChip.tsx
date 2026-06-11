import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Project} from '../../types';

interface Props {
  project: Project;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.bgMuted,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: spacing.xs,
    },
    dot: {width: 7, height: 7, borderRadius: 4, marginRight: 4},
    label: {
      color: c.textSecondary,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.medium,
    },
    colorWork: {}, colorPersonal: {}, colorOther: {},
  });

export default function ProjectChip({project}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dotColor =
    project.type === 'work' ? colors.badgeWork :
    project.type === 'personal' ? colors.badgePersonal :
    colors.textMuted;

  return (
    <View style={styles.chip}>
      <View style={[styles.dot, {backgroundColor: dotColor}]} />
      <Text style={styles.label}>{project.name}</Text>
    </View>
  );
}
