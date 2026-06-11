import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, typography, spacing, radius} from '../../theme';
import type {Project} from '../../types';

const TYPE_COLOR: Record<Project['type'], string> = {
  work: colors.badgeWork,
  personal: colors.badgePersonal,
  other: colors.textMuted,
};

interface Props {
  project: Project;
}

export default function ProjectChip({project}: Props) {
  return (
    <View style={styles.chip}>
      <View
        style={[styles.dot, {backgroundColor: TYPE_COLOR[project.type]}]}
      />
      <Text style={styles.label}>{project.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 4,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
});
