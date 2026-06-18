import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Entry} from '../../types';
import EntryTypeIcon from './EntryTypeIcon';
import MediaThumbnail from '../media/MediaThumbnail';
import ActivityBadge from './ActivityBadge';
import ProjectChip from './ProjectChip';
import TagChip from './TagChip';
import {formatTime, durationBetween} from '../../utils/dateUtils';

interface Props {
  entry: Entry;
  onPress: () => void;
}

function formatDurationClock(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    item: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
    },
    content: {flex: 1, gap: spacing.xs},
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
      color: c.textPrimary,
    },
    titlePlaceholder: {
      flex: 1,
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      fontStyle: 'italic',
    },
    timeGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    duration: {
      fontSize: typography.sizes.sm,
      color: c.success,
      fontWeight: typography.weights.medium,
    },
    time: {fontSize: typography.sizes.sm, color: c.textMuted},
    body: {fontSize: typography.sizes.sm, color: c.textSecondary, lineHeight: 18},
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: 2,
    },
    location: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    todoBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.primary + '15',
    },
    todoBadgeDone: {backgroundColor: c.bgMuted},
    todoBadgeText: {fontSize: typography.sizes.xs, color: c.primary, fontWeight: typography.weights.semibold},
    todoBadgeTextDone: {color: c.textMuted},
    leadWrap: {width: 44, height: 44},
    countBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: {color: c.white, fontSize: 11, fontWeight: typography.weights.bold},
  });

export default function EntryListItem({entry, onPress}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolvedDurationSec =
    entry.duration_sec != null
      ? entry.duration_sec
      : entry.time_from && entry.time_to
        ? Math.max(0, durationBetween(entry.time_from, entry.time_to))
        : null;
  const durationLabel =
    resolvedDurationSec != null && resolvedDurationSec > 0
      ? formatDurationClock(resolvedDurationSec)
      : null;
  const timeLabel = entry.time_from
    ? `${formatTime(entry.time_from)}${entry.time_to ? ` - ${formatTime(entry.time_to)}` : ''}`
    : formatTime(entry.created_at);

  const mediaList = entry.media ?? [];
  const photo = mediaList.find(m => m.media_type === 'photo');
  const leadType = photo ? 'photo' : mediaList[0]?.media_type ?? 'note';
  const leadThumb = photo ? photo.thumbnail_path || photo.file_path : null;

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.leadWrap}>
        {mediaList.length > 0 ? (
          <MediaThumbnail entryType={leadType} thumbnailPath={leadThumb} size={44} />
        ) : (
          <EntryTypeIcon type="note" size={44} />
        )}
        {mediaList.length > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{mediaList.length}</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          {entry.title ? (
            <Text style={styles.title} numberOfLines={1}>{entry.title}</Text>
          ) : (
            <Text style={styles.titlePlaceholder} numberOfLines={1}>
              {entry.body ?? t('entryType.note')}
            </Text>
          )}
          <View style={styles.timeGroup}>
            {durationLabel ? <Text style={styles.duration}>{durationLabel}</Text> : null}
            <Text style={styles.time}>{timeLabel}</Text>
          </View>
        </View>
        {entry.body && entry.title ? (
          <Text style={styles.body} numberOfLines={2}>{entry.body}</Text>
        ) : null}
        <View style={styles.chips}>
          {entry.is_todo ? (
            <View style={[styles.todoBadge, entry.completed_at != null && styles.todoBadgeDone]}>
              <Text style={[styles.todoBadgeText, entry.completed_at != null && styles.todoBadgeTextDone]}>
                {entry.completed_at ? `✓ ${t('todo.done')}` : t('todo.badge')}
              </Text>
            </View>
          ) : null}
          <ActivityBadge type={entry.activity_type} />
          {entry.project ? <ProjectChip project={entry.project} /> : null}
          {(entry.tags ?? []).slice(0, 3).map(tag => (
            <TagChip key={tag.id} name={tag.name} />
          ))}
        </View>
        {entry.location_label ? (
          <Text style={styles.location}>📍 {entry.location_label}</Text>
        ) : entry.latitude != null ? (
          <Text style={styles.location}>
            📍 {entry.latitude.toFixed(4)}, {entry.longitude?.toFixed(4)}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
