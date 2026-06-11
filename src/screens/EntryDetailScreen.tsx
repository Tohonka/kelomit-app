import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  Vibration,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getEntry} from '../db/entries';
import {useEntryStore} from '../store/entryStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import ActivityBadge from '../components/entries/ActivityBadge';
import ProjectChip from '../components/entries/ProjectChip';
import TagChip from '../components/entries/TagChip';
import AudioPlayer from '../components/media/AudioPlayer';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {Entry} from '../types';
import {formatTime, formatDate} from '../utils/dateUtils';
import {fileUri} from '../utils/mediaUtils';

type Props = RootStackScreenProps<'EntryDetailScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl},
    metaRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      flexWrap: 'wrap',
      marginBottom: spacing.md,
    },
    editBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    editBtnText: {
      color: c.primary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: spacing.lg,
    },
    mediaImage: {
      width: '100%',
      height: 240,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
      marginBottom: spacing.lg,
    },
    videoPlaceholder: {
      width: '100%',
      height: 160,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    videoIcon: {fontSize: 40},
    videoHint: {fontSize: typography.sizes.sm, color: c.textMuted},
    infoSection: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    infoRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
    infoLabel: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
    infoValue: {
      fontSize: typography.sizes.sm,
      color: c.textPrimary,
      fontWeight: typography.weights.medium,
    },
    tags: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, gap: spacing.xs},
    deleteBtn: {marginTop: spacing.xxl, alignItems: 'center', paddingVertical: spacing.md},
    deleteBtnText: {
      color: c.error,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
  });

export default function EntryDetailScreen({navigation, route}: Props) {
  const {entryId, dayId} = route.params;
  const {removeEntry} = useEntryStore();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    getEntry(entryId).then(e => {
      setEntry(e);
      if (e?.title) {
        navigation.setOptions({title: e.title});
      }
    });
  }, [entryId, navigation]);

  // Refresh after returning from edit
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      getEntry(entryId).then(e => {
        if (e) { setEntry(e); }
      });
    });
    return unsub;
  }, [navigation, entryId]);

  const handleEdit = () => {
    if (!entry) { return; }
    navigation.navigate('AddEntryModal', {dayId, entryId: entry.id});
  };

  const handleDelete = () => {
    Alert.alert('Delete entry', 'This action cannot be undone.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Vibration.vibrate([0, 40, 60, 40]);
          await removeEntry(entryId, dayId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (!entry) { return null; }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <ActivityBadge type={entry.activity_type} />
          {entry.project ? <ProjectChip project={entry.project} /> : null}
          <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {entry.title ? <Text style={styles.title}>{entry.title}</Text> : null}
        {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}

        {entry.entry_type === 'photo' && entry.file_path ? (
          <Image
            source={{uri: fileUri(entry.file_path)}}
            style={styles.mediaImage}
            resizeMode="cover"
          />
        ) : null}

        {entry.entry_type === 'voice' && entry.file_path ? (
          <AudioPlayer filePath={entry.file_path} durationSec={entry.duration_sec} />
        ) : null}

        {entry.entry_type === 'video' && entry.file_path ? (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoIcon}>🎥</Text>
            <Text style={styles.videoHint}>Video file saved</Text>
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{entry.entry_type}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Created</Text>
            <Text style={styles.infoValue}>
              {formatDate(entry.created_at.slice(0, 10))} {formatTime(entry.created_at)}
            </Text>
          </View>
          {entry.time_from ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>From</Text>
              <Text style={styles.infoValue}>{formatTime(entry.time_from)}</Text>
            </View>
          ) : null}
          {entry.time_to ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>To</Text>
              <Text style={styles.infoValue}>{formatTime(entry.time_to)}</Text>
            </View>
          ) : null}
          {entry.duration_sec ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{Math.floor(entry.duration_sec / 60)}m</Text>
            </View>
          ) : null}
          {entry.location_label ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{entry.location_label}</Text>
            </View>
          ) : null}
        </View>

        {(entry.tags ?? []).length > 0 ? (
          <View style={styles.tags}>
            {(entry.tags ?? []).map(t => <TagChip key={t.id} name={t.name} />)}
          </View>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete entry</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
