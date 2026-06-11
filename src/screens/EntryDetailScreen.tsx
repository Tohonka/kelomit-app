import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {getEntry} from '../db/entries';
import {useEntryStore} from '../store/entryStore';
import {colors, typography, spacing} from '../theme';
import ActivityBadge from '../components/entries/ActivityBadge';
import ProjectChip from '../components/entries/ProjectChip';
import TagChip from '../components/entries/TagChip';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {Entry} from '../types';
import {formatTime, formatDate} from '../utils/dateUtils';

type Props = RootStackScreenProps<'EntryDetailScreen'>;

export default function EntryDetailScreen({navigation, route}: Props) {
  const {entryId, dayId} = route.params;
  const {removeEntry} = useEntryStore();
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    getEntry(entryId).then(e => {
      setEntry(e);
      if (e?.title) {
        navigation.setOptions({title: e.title});
      }
    });
  }, [entryId, navigation]);

  const handleDelete = () => {
    Alert.alert('Delete entry', 'This action cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeEntry(entryId, dayId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!entry) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <ActivityBadge type={entry.activity_type} />
          {entry.project ? <ProjectChip project={entry.project} /> : null}
        </View>

        {entry.title ? (
          <Text style={styles.title}>{entry.title}</Text>
        ) : null}

        {entry.body ? (
          <Text style={styles.body}>{entry.body}</Text>
        ) : null}

        <View style={styles.infoSection}>
          <InfoRow label="Type" value={entry.entry_type} />
          <InfoRow
            label="Created"
            value={`${formatDate(entry.created_at.slice(0, 10))} ${formatTime(entry.created_at)}`}
          />
          {entry.time_from ? (
            <InfoRow
              label="From"
              value={formatTime(entry.time_from)}
            />
          ) : null}
          {entry.time_to ? (
            <InfoRow
              label="To"
              value={formatTime(entry.time_to)}
            />
          ) : null}
          {entry.duration_sec ? (
            <InfoRow
              label="Duration"
              value={`${Math.floor(entry.duration_sec / 60)}m`}
            />
          ) : null}
          {entry.location_label ? (
            <InfoRow label="Location" value={entry.location_label} />
          ) : null}
        </View>

        {(entry.tags ?? []).length > 0 ? (
          <View style={styles.tags}>
            {(entry.tags ?? []).map(t => (
              <TagChip key={t.id} name={t.name} />
            ))}
          </View>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete entry</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.lg, paddingBottom: spacing.xxl},
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  infoSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  deleteBtn: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  deleteBtnText: {
    color: colors.error,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
  },
  value: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
  },
});
