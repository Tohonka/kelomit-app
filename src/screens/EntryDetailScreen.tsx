import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import {haptic, HAPTIC_START, HAPTIC_CANCEL} from '../utils/haptics';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {getEntry, getSubnotes, deleteEntryMedia, updateEntry} from '../db/entries';
import {mergeTranscriptIntoBody} from '../utils/transcript';
import {useEntryStore} from '../store/entryStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import ActivityBadge from '../components/entries/ActivityBadge';
import ProjectChip from '../components/entries/ProjectChip';
import TagChip from '../components/entries/TagChip';
import AudioPlayer from '../components/media/AudioPlayer';
import VoiceTranscript from '../components/media/VoiceTranscript';
import ZoomableImageModal from '../components/media/ZoomableImageModal';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {Entry, EntryMedia} from '../types';
import {formatTime, formatDate, todayDate, localDateOf} from '../utils/dateUtils';
import {deleteMediaFile, fileUri} from '../utils/mediaUtils';
import {scheduleTodoReminder, cancelTodoReminder} from '../services/notificationService';

type Props = RootStackScreenProps<'EntryDetailScreen'>;

const TYPE_GLYPH: Record<string, string> = {note: '✏️', photo: '📷', video: '🎥', voice: '🎙️'};

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
    smallTaskBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: c.bgMuted,
    },
    smallTaskBadgeText: {
      color: c.textSecondary,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
    },
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
    partOf: {
      fontSize: typography.sizes.sm,
      color: c.primary,
      fontWeight: typography.weights.semibold,
      marginBottom: spacing.md,
    },
    subSection: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginTop: spacing.lg,
      paddingTop: spacing.md,
    },
    subHeader: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
      marginBottom: spacing.xs,
    },
    subRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm},
    subGlyph: {fontSize: 16},
    subTitle: {flex: 1, fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
    subMeta: {fontSize: typography.sizes.sm, color: c.textMuted},
    subAddBtn: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    subAddText: {color: c.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
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
  const [subnotes, setSubnotes] = useState<Entry[]>([]);
  const [parent, setParent] = useState<Entry | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  const loadTree = useCallback(async (e: Entry | null) => {
    setEntry(e);
    if (!e) { return; }
    const [subs, par] = await Promise.all([
      getSubnotes(e.id),
      e.parent_id != null ? getEntry(e.parent_id) : Promise.resolve(null),
    ]);
    setSubnotes(subs);
    setParent(par);
  }, []);

  useEffect(() => {
    getEntry(entryId).then(e => {
      loadTree(e);
      if (e?.title) {
        navigation.setOptions({title: e.title});
      }
    });
  }, [entryId, navigation, loadTree]);

  // Refresh after returning from edit / add-subnote
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      getEntry(entryId).then(e => {
        if (e) { loadTree(e); }
      });
    });
    return unsub;
  }, [navigation, entryId, loadTree]);

  const handleEdit = () => {
    if (!entry) { return; }
    navigation.navigate('AddEntryModal', {dayId, entryId: entry.id});
  };

  const canComplete = !entry?.scheduled_date || todayDate() >= entry.scheduled_date;
  const handleToggleDone = async () => {
    if (!entry) { return; }
    const markDone = entry.completed_at == null;
    if (markDone && !canComplete) { return; }
    haptic(HAPTIC_START);
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

  const refreshEntry = () => {
    getEntry(entryId).then(e => { if (e) { setEntry(e); } });
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
          haptic(HAPTIC_CANCEL);
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
          <VoiceTranscript
            media={m}
            onChanged={refreshEntry}
            onNeedKey={() => navigation.navigate('TranscriptionSettings')}
            onUseAsNote={async text => {
              if (!entry) { return; }
              await updateEntry(entry.id, {body: mergeTranscriptIntoBody(entry.body, text)});
              refreshEntry();
            }}
          />
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

  // Swipe left = go back. failOffsetY keeps vertical scrolling intact.
  const swipeBack = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd(e => {
          if (e.translationX <= -50) { navigation.goBack(); }
        }),
    [navigation],
  );

  if (!entry) { return null; }

  return (
    <SafeAreaView style={styles.container}>
      <GestureDetector gesture={swipeBack}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <ActivityBadge type={entry.activity_type} />
          {entry.is_small_task ? (
            <View style={styles.smallTaskBadge}>
              <Text style={styles.smallTaskBadgeText}>{translate('smallTask.badge')}</Text>
            </View>
          ) : null}
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

        {parent ? (
          <TouchableOpacity
            onPress={() => navigation.push('EntryDetailScreen', {entryId: parent.id, dayId: parent.day_id})}>
            <Text style={styles.partOf} numberOfLines={1}>
              {translate('subnotes.partOf')}: {parent.title || parent.body || translate('subnotes.untitled')}
            </Text>
          </TouchableOpacity>
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
          {entry.time_from && !entry.is_small_task ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{translate('common.from')}</Text>
              <Text style={styles.infoValue}>{formatTime(entry.time_from)}</Text>
            </View>
          ) : null}
          {entry.time_to && !entry.is_small_task ? (
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

        {entry.parent_id == null ? (
          <View style={styles.subSection}>
            <Text style={styles.subHeader}>{translate('subnotes.title')}</Text>
            {subnotes.map(sub => (
              <TouchableOpacity
                key={sub.id}
                style={styles.subRow}
                onPress={() => navigation.push('EntryDetailScreen', {entryId: sub.id, dayId: sub.day_id})}>
                <Text style={styles.subGlyph}>{TYPE_GLYPH[sub.media?.[0]?.media_type ?? 'note']}</Text>
                <Text style={styles.subTitle} numberOfLines={1}>
                  {sub.title || sub.body || translate('subnotes.untitled')}
                </Text>
                <Text style={styles.subMeta}>{formatTime(sub.time_from ?? sub.created_at)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.subAddBtn}
              onPress={() => navigation.navigate('AddEntryModal', {dayId, parentId: entry.id})}>
              <Text style={styles.subAddText}>+ {translate('subnotes.add')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>{translate('entries.deleteEntry')}</Text>
        </TouchableOpacity>
      </ScrollView>
      </GestureDetector>
      <ZoomableImageModal uri={zoomUri} onClose={() => setZoomUri(null)} />
    </SafeAreaView>
  );
}
