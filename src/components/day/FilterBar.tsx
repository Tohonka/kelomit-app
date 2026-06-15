import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {ScrollView, TouchableOpacity, Text, View, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Project, Tag} from '../../types';

interface Props {
  projects: Project[];
  tags: Tag[];
  selectedProjectId: number | null;
  selectedTagIds: number[];
  onSelectProject: (id: number | null) => void;
  onToggleTag: (id: number) => void;
  onClear: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrapper: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
    },
    row: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      alignItems: 'center',
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    chipText: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    chipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    clearChip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: c.bgMuted,
    },
    clearText: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
  });

export default function FilterBar({
  projects,
  tags,
  selectedProjectId,
  selectedTagIds,
  onSelectProject,
  onToggleTag,
  onClear,
}: Props) {
  const {t: translate} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const activeProjects = projects.filter(p => !p.archived);
  const hasFilter = selectedProjectId != null || selectedTagIds.length > 0;

  if (activeProjects.length === 0 && tags.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {hasFilter && (
          <TouchableOpacity style={styles.clearChip} onPress={onClear}>
            <Text style={styles.clearText}>✕ {translate('common.clear')}</Text>
          </TouchableOpacity>
        )}
        {activeProjects.map(p => (
          <TouchableOpacity
            key={`p-${p.id}`}
            style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
            onPress={() => onSelectProject(selectedProjectId === p.id ? null : p.id)}>
            <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
        {tags.map(t => (
          <TouchableOpacity
            key={`t-${t.id}`}
            style={[styles.chip, selectedTagIds.includes(t.id) && styles.chipActive]}
            onPress={() => onToggleTag(t.id)}>
            <Text style={[styles.chipText, selectedTagIds.includes(t.id) && styles.chipTextActive]}>
              #{t.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
