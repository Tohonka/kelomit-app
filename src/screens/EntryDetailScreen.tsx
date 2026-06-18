import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
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
import {getEntry, deleteEntryMedia} from '../db/entries';
import {useEntryStore} from '../store/entryStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import ActivityBadge from '../components/entries/ActivityBadge';
import ProjectChip from '../components/entries/ProjectChip';
import TagChip from '../components/entries/TagChip';
import AudioPlayer from '../components/media/AudioPlayer';
import ZoomableImageModal from '../components/media/ZoomableImageModal';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {Entry, EntryMedia} from '../types';
import {formatTime, formatDate, todayDate, localDateOf} from '../utils/dateUtils';
import {deleteMediaFile, fileUri} from '../utils/mediaUtils';
import {scheduleTodoReminder, cancelTodoReminder} from '../services/notificationService';

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
    attachWrap: {position: 'relative', marginBottom: spacing.md},
    attachRemove: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#000a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachRemoveText: {color: '#fff', fontSize: 18, lineHeight: 20},
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
    todoCard: {
      backgroundColor: c.primary + '10',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.primary + '40',
      padding: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    todoTop: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    todoTitle: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.primary},
    todoSchedule: {fontSize: typography.sizes.sm, color: c.textSecondary},
    todoBtn: {
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    todoBtnReopen: {backgroundColor: c.bgMuted},
    todoBtnDisabled: {opacity: 0.4},
    todoBtnText: {color: c.white, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    todoBtnTextReopen: {color: c.textSecondary},
    todoHint: {fontSize: typography.sizes.xs, color: c.textMuted},
    deleteBtn: {marginTop: spacing.xxl, alignItems: 'center', paddingVertical: spacing.md},
    deleteBtnText: {
      color: c.error,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
  });

export default function EntryDetailScreen({navigation, route}: Props) {
  const {t: translate} = useTranslation();
  const {entryId, dayId} = route.params;
  const {removeEntry, setTodoDone} = useEntryStore();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

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

  const canComplete = !entry?.scheduled_date || todayDate() >= entry.scheduled_date;
  const handleToggleDone = async () => {
    if (!entry) { return; }
    const markDone = entry.completed_at == null;
    if (markDone && !canComplete) { return; }
    Vibration.vibrate(40);
    await setTodoDone(entry.id, dayId, markDone);
    const fresh = await getEntry(entry.id);
    if (fresh) {
      setEntry(fresh);
      // Completing cancels the reminder; reopening re-arms it if still in future.
      if (markDone) { cancelTodoReminder(fresh.id).catch(() => {}); }
      else { scheduleTodoReminder(fresh).catch(() => {}); }
    }
  };

  const handleDeleteAttachment = (m: EntryMedia) => {
    Alert.alert(translate('entries.removeAttachmentTitle'), translate('entries.removeAttachmentMessage'), [
      {text: translate('common.cancel'), style: 'cancel'},
      {
        text: translate('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteEntryMedia(m.id);
          await deleteMediaFile(m.file_path);
          if (m.thumbnail_path && m.thumbnail_path !== m.file_path) {
            await deleteMediaFile(m.thumbnail_path);
          }
          const fresh = await getEntry(entryId);
          if (fresh) { setEntry(fresh); }
        },
      },
    ]);
  };

  const handleDelete = () => {
    if (!entry) { return; }
    const entryToDelete = entry;
    Alert.alert(translate('entries.deleteTitle'), translate('entries.deleteMessage'), [
      {text: translate('common.cancel'), style: 'cancel'},
      {
        text: translate('common.delete'),
        style: 'destructive',
        onPress: async () => {
          Vibration.vibrate([0, 40, 60, 40]);
          cancelTodoReminder(entryId).catch(() => {});
          await removeEntry(entryId, dayId);
          // Delete every attachment's files plus any legacy inline file.
          const files = new Set<string>();
          for (const m of entryToDelete.media ?? []) {
            files.add(m.file_path);
            if (m.thumbnail_path) { files.add(m.thumbnail_path); }
          }
          if (entryToDelete.file_path) { files.add(entryToDelete.file_path); }
          if (entryToDelete.thumbnail_path) { files.add(entryToDelete.thumbnail_path); }
          await Promise.all([...files].map(deleteMediaFile));
          navigation.goBack();
        },
      },
    ]);
  };

  const renderMedia = (m: EntryMedia) => {
    const removeBtn = (
      <TouchableOpacity
        style={styles.attachRemove}
        onPress={() => handleDeleteAttachment(m)}
        accessibilityLabel={translate('common.delete')}>
        <Text style={styles.attachRemoveText}>×</Text>
      </TouchableOpacity>
    );
    if (m.media_type === 'photo') {
      return (
        <View key={m.id} style={styles.attachWrap}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomUri(m.file_path)}>
            <Image source={{uri: fileUri(m.thumbnail_path || m.file_path)}} style={styles.mediaImage} resizeMode="cover" />
          </TouchableOpacity>
          {removeBtn}
        </View>
      );
    }
    if (m.media_type === 'voice') {
      return (
        <View key={m.id} style={styles.attachWrap}>
          <AudioPlayer filePath={m.file_path} durationSec={m.duration_sec} />
          {removeBtn}
        </View>
      );
    }
    return (
      <View key={m.id} style={styles.attachWrap}>
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoIcon}>🎥</Text>
          <Text style={styles.videoHint}>{translate('entries.videoFileSaved')}</Text>
        </View>
        {removeBtn}
      </View>
    );
  };

  if (!entry) { return null; }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <ActivityBadge type={entry.activity_type} />
          {entry.project ? <ProjectChip project={entry.project} /> : null}
          <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
            <Text style={styles.editBtnText}>{translate('common.edit')}</Text>
          </TouchableOpacity>
        </View>

        {entry.is_todo ? (
          <View style={styles.todoCard}>
            <View style={styles.todoTop}>
              <Text style={styles.todoTitle}>
                {entry.completed_at ? translate('todo.done') : translate('todo.badge')}
              </Text>
              {entry.scheduled_date ? (
                <Text style={styles.todoSchedule}>
                  {translate('todo.scheduledFor')}: {formatDate(entry.scheduled_date)}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.todoBtn,
                entry.completed_at != null && styles.todoBtnReopen,
                entry.completed_at == null && !canComplete && styles.todoBtnDisabled,
              ]}
              onPress={handleToggleDone}
              disabled={entry.completed_at == null && !canComplete}>
              <Text style={[styles.todoBtnText, entry.completed_at != null && styles.todoBtnTextReopen]}>
                {entry.completed_at ? translate('todo.reopen') : translate('todo.markDone')}
              </Text>
            </TouchableOpacity>
            {entry.completed_at == null && !canComplete && entry.scheduled_date ? (
              <Text style={styles.todoHint}>
                {translate('todo.availableOn', {date: formatDate(entry.scheduled_date)})}
              </Text>
            ) : null}
          </View>
        ) : null}

        {entry.title ? <Text style={styles.title}>{entry.title}</Text> : null}
        {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}

        {(entry.media ?? []).map(renderMedia)}

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{translate('entries.created')}</Text>
            <Text style={styles.infoValue}>
              {formatDate(localDateOf(entry.created_at))} {formatTime(entry.created_at)}
            </Text>
          </View>
          {entry.time_from ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{translate('common.from')}</Text>
              <Text style={styles.infoValue}>{formatTime(entry.time_from)}</Text>
            </View>
          ) : null}
          {entry.time_to ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{translate('common.to')}</Text>
              <Text style={styles.infoValue}>{formatTime(entry.time_to)}</Text>
            </View>
          ) : null}
          {entry.duration_sec ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{translate('entries.duration')}</Text>
              <Text style={styles.infoValue}>
                {Math.floor(entry.duration_sec / 60)}{translate('entries.minuteUnit')}
              </Text>
            </View>
          ) : null}
          {entry.location_label ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{translate('entries.location')}</Text>
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
          <Text style={styles.deleteBtnText}>{translate('entries.deleteEntry')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <ZoomableImageModal uri={zoomUri} onClose={() => setZoomUri(null)} />
    </SafeAreaView>
  );
}
