import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {colors, typography, spacing, radius} from '../../theme';
import type {Entry} from '../../types';
import EntryTypeIcon from './EntryTypeIcon';
import ActivityBadge from './ActivityBadge';
import ProjectChip from './ProjectChip';
import TagChip from './TagChip';
import {formatTime} from '../../utils/dateUtils';

interface Props {
  entry: Entry;
  onPress: () => void;
}

export default function EntryListItem({entry, onPress}: Props) {
  const timeLabel = entry.time_from ? formatTime(entry.time_from) : formatTime(entry.created_at);

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <EntryTypeIcon type={entry.entry_type} />
      <View style={styles.content}>
        <View style={styles.row}>
          {entry.title ? (
            <Text style={styles.title} numberOfLines={1}>
              {entry.title}
            </Text>
          ) : (
            <Text style={styles.titlePlaceholder} numberOfLines={1}>
              {entry.body ?? entry.entry_type}
            </Text>
          )}
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        {entry.body && entry.title ? (
          <Text style={styles.body} numberOfLines={2}>
            {entry.body}
          </Text>
        ) : null}
        <View style={styles.chips}>
          <ActivityBadge type={entry.activity_type} />
          {entry.project ? <ProjectChip project={entry.project} /> : null}
          {(entry.tags ?? []).slice(0, 3).map(tag => (
            <TagChip key={tag.id} name={tag.name} />
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  titlePlaceholder: {
    flex: 1,
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  time: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
});
