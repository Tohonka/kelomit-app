import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Vibration,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import {useEntryStore} from '../store/entryStore';
import {useProjectStore} from '../store/projectStore';
import {useTagStore} from '../store/tagStore';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import TagChip from '../components/entries/TagChip';
import ProjectPicker from '../components/entries/ProjectPicker';
import TimePicker from '../components/ui/TimePicker';
import AttachmentsSection, {type EditorMedia} from '../components/media/AttachmentsSection';
import LeaveEditor from '../components/entries/LeaveEditor';
import DateTimePicker from '@react-native-community/datetimepicker';
import {deleteMediaFile, ensureMediaDir} from '../utils/mediaUtils';
import {getLastKnownPosition} from '../services/gpsService';
import {scheduleTodoReminder, requestNotificationPermission} from '../services/notificationService';
import {getEntry, addEntryMedia, deleteEntryMedia} from '../db/entries';
import {getOrCreateDay} from '../db/days';
import {formatDate, todayDate} from '../utils/dateUtils';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {ActivityType, Entry, Tag} from '../types';

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Combine a YYYY-MM-DD date with an hour/minute into a local-time ISO string. */
function combineDateTime(dateStr: string, hours: number, minutes: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

type Props = RootStackScreenProps<'AddEntryModal'>;

const ACTIVITY_TYPES: {type: ActivityType; labelKey: string}[] = [
  {type: 'work', labelKey: 'activity.work'},
  {type: 'personal_work', labelKey: 'activity.personal_work'},
  {type: 'personal', labelKey: 'activity.personal'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl},
    tabRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    tab: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    tabActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    tabText: {
      color: c.textMuted,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
    tabTextActive: {color: c.primary},
    sectionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    typeRow: {flexDirection: 'row', gap: spacing.sm},
    typeBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    typeBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '12'},
    typeBtnDisabled: {opacity: 0.45},
    typeEmoji: {fontSize: 22},
    typeLabel: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
      marginTop: 4,
    },
    typeLabelActive: {color: c.primary, fontWeight: typography.weights.semibold},
    activityRow: {flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap'},
    activityBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    activityBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    activityLabel: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    activityLabelActive: {color: c.primary, fontWeight: typography.weights.semibold},
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    inputMultiline: {minHeight: 96, paddingTop: spacing.md},
    tagInputRow: {flexDirection: 'row', gap: spacing.sm, alignItems: 'center'},
    tagInput: {flex: 1},
    tagAddBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 48,
      justifyContent: 'center',
    },
    tagAddBtnText: {
      color: c.white,
      fontWeight: typography.weights.semibold,
      fontSize: typography.sizes.base,
    },
    suggestions: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 2,
    },
    suggestion: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tagChips: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm},
    saveRow: {marginTop: spacing.xl},
    saveBtn: {width: '100%'},
    timeModeRow: {flexDirection: 'row', gap: spacing.sm},
    timeModeBtn: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      backgroundColor: c.bgCard,
    },
    timeModeBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    timeModeBtnText: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    timeModeBtnTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    durationRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm},
    durationInput: {flex: 1, textAlign: 'center'},
    durationStartBlock: {gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.md},
    durationUnit: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    rangeRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm},
    rangeBlock: {flex: 1, gap: spacing.xs, alignItems: 'center'},
    rangeLabel: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    rangeSep: {fontSize: typography.sizes.md, color: c.textMuted, marginTop: spacing.lg},
    todoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
    },
    todoLabel: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
    todoToggle: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
    },
    todoToggleOn: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    todoToggleText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.textMuted},
    todoToggleTextOn: {color: c.primary},
    scheduleBtn: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    scheduleLabel: {fontSize: typography.sizes.xs, color: c.textMuted, fontWeight: typography.weights.medium},
    scheduleValue: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.semibold, marginTop: 2},
    todoHint: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: spacing.sm, lineHeight: 16},
    reminderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    subnoteOf: {
      fontSize: typography.sizes.sm,
      color: c.primary,
      fontWeight: typography.weights.semibold,
      marginBottom: spacing.xs,
    },
  });

export default function AddEntryModal({navigation, route}: Props) {
  const {t: translate} = useTranslation();
  const {dayId, entryId, leaveRangeId, initialTab} = route.params;
  const entryDate = route.params.date ?? todayDate();
  const isEdit = entryId != null;
  const prefill = isEdit ? undefined : route.params.prefill;
  // Subnote mode (create only): inherits the parent's project + day, no to-do.
  const parentId = isEdit ? undefined : route.params.parentId;
  const [parent, setParent] = useState<Entry | null>(null);
  const canSwitchTabs = entryId == null && leaveRangeId == null && parentId == null;
  const {addEntry, editEntry, loadEntriesForDay} = useEntryStore();
  const {projects, loaded: projectsLoaded, load: loadProjects, add: addProject} = useProjectStore();
  const {tags, loaded: tagsLoaded, load: loadTags, getOrCreate} = useTagStore();
  const {
    loaded: settingsLoaded,
    load: loadSettings,
    default_activity_type,
    default_project_id,
  } = useSettingsStore();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [activityType, setActivityType] = useState<ActivityType>('work');
  const [isOvertime, setIsOvertime] = useState(false);
  const [editorTab, setEditorTab] = useState<'note' | 'leave'>(
    leaveRangeId != null ? 'leave' : initialTab ?? 'note',
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(prefill?.body ?? '');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(isEdit || parentId != null);

  // A note's media attachments (Iteration 4). Existing ones carry an `id`.
  const [media, setMediaList] = useState<EditorMedia[]>([]);
  const [removedMedia, setRemovedMedia] = useState<EditorMedia[]>([]);

  type TimeMode = 'none' | 'duration' | 'range';
  const [timeMode, setTimeMode] = useState<TimeMode>(
    prefill?.timeFrom ? 'range' : 'none',
  );
  const [durationMinutes, setDurationMinutes] = useState('');
  // Optional explicit start for duration entries; null → default to "now" on save.
  const [durationStart, setDurationStart] = useState<string | null>(null);
  const [timeFrom, setTimeFrom] = useState<string | null>(prefill?.timeFrom ?? null);
  const [timeTo, setTimeTo] = useState<string | null>(prefill?.timeTo ?? null);
  const defaultsApplied = useRef(false);

  const [isTodo, setIsTodo] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
  });
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderAt, setReminderAt] = useState<string | null>(null);

  // Keep the reminder on the scheduled day (preserving the chosen time of day).
  useEffect(() => {
    if (!reminderEnabled) { return; }
    setReminderAt(prev => {
      const base = prev ? new Date(prev) : null;
      return combineDateTime(scheduledDate, base?.getHours() ?? 9, base?.getMinutes() ?? 0);
    });
  }, [scheduledDate, reminderEnabled]);

  const toggleReminder = async () => {
    const next = !reminderEnabled;
    setReminderEnabled(next);
    if (next) {
      requestNotificationPermission().catch(() => {});
    }
  };

  // Keep the focused text field visible above the keyboard. Android adjustResize
  // shrinks the window but doesn't scroll RN's ScrollView, and bottom fields have
  // nothing below them to scroll into view. Fix: add keyboard-height padding (a
  // scroll "runway") and lift the focused field up once the keyboard is shown.
  const scrollRef = useRef<ScrollView>(null);
  const inputY = useRef<Record<string, number>>({});
  const focusedKey = useRef<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  const rememberY = (key: string) => (e: LayoutChangeEvent) => {
    inputY.current[key] = e.nativeEvent.layout.y;
  };
  const scrollToFocused = useCallback(() => {
    const key = focusedKey.current;
    const y = key ? inputY.current[key] : undefined;
    if (y == null) { return; }
    scrollRef.current?.scrollTo({y: Math.max(y - 12, 0), animated: true});
  }, []);
  const onFieldFocus = (key: string) => () => {
    focusedKey.current = key;
    // Switching fields while the keyboard is already open fires no didShow event.
    setTimeout(scrollToFocused, 50);
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      setKbHeight(e.endCoordinates?.height ?? 0);
      setTimeout(scrollToFocused, 20);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
      focusedKey.current = null;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [scrollToFocused]);

  useEffect(() => {
    if (!projectsLoaded) { loadProjects(); }
    if (!tagsLoaded) { loadTags(); }
    if (!settingsLoaded) { loadSettings(); }
    ensureMediaDir().catch(() => {});
  }, [projectsLoaded, tagsLoaded, settingsLoaded, loadProjects, loadTags, loadSettings]);

  useEffect(() => {
    if (isEdit || !settingsLoaded || defaultsApplied.current) {
      return;
    }
    setActivityType(default_activity_type);
    setSelectedProjectId(default_project_id);
    defaultsApplied.current = true;
  }, [isEdit, settingsLoaded, default_activity_type, default_project_id]);

  useEffect(() => {
    if (parentId == null) { return; }
    getEntry(parentId).then(p => {
      setParent(p);
      setLoadingEntry(false);
    });
  }, [parentId]);

  // Pre-fill fields when editing
  useEffect(() => {
    if (!isEdit || entryId == null) {
      return;
    }
    getEntry(entryId).then(e => {
      if (!e) { return; }
      setActivityType(e.activity_type);
      setIsOvertime(e.is_overtime);
      setTitle(e.title ?? '');
      setBody(e.body ?? '');
      setSelectedProjectId(e.project_id);
      setSelectedTags(e.tags ?? []);
      setMediaList(
        (e.media ?? []).map(m => ({
          id: m.id,
          media_type: m.media_type,
          file_path: m.file_path,
          thumbnail_path: m.thumbnail_path,
          duration_sec: m.duration_sec,
        })),
      );
      if (e.duration_sec != null) {
        setTimeMode('duration');
        setDurationMinutes(String(Math.round(e.duration_sec / 60)));
        setDurationStart(e.time_from);
      } else if (e.time_from != null) {
        setTimeMode('range');
        setTimeFrom(e.time_from);
        setTimeTo(e.time_to);
      }
      setLoadingEntry(false);
    });
  }, [isEdit, entryId]);

  const addTag = async (name: string) => {
    const n = name.trim();
    if (!n) { return; }
    const already = selectedTags.find(t => t.name.toLowerCase() === n.toLowerCase());
    if (already) { setTagInput(''); return; }
    const tag = await getOrCreate(n);
    setSelectedTags(prev => [...prev, tag]);
    setTagInput('');
  };

  const removeTag = (id: number) => {
    setSelectedTags(prev => prev.filter(t => t.id !== id));
  };

  const addMedia = (m: EditorMedia) => setMediaList(prev => [...prev, m]);

  const removeMedia = (index: number) => {
    setMediaList(prev => {
      const removed = prev[index];
      if (removed) { setRemovedMedia(r => [...r, removed]); }
      return prev.filter((_, i) => i !== index);
    });
  };

  /** Delete the underlying files of removed attachments (file + distinct thumb). */
  const cleanupRemovedFiles = async () => {
    const paths = new Set<string>();
    for (const m of removedMedia) {
      paths.add(m.file_path);
      if (m.thumbnail_path && m.thumbnail_path !== m.file_path) {
        paths.add(m.thumbnail_path);
      }
    }
    await Promise.all([...paths].map(deleteMediaFile));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const durationSec =
        timeMode === 'duration' && durationMinutes.trim()
          ? Math.round(parseFloat(durationMinutes) * 60)
          : null;

      // Every entry gets a real from→to so the hours model can place it.
      // Duration entries: start = user-picked start, else "now" on the entry's
      // day (ponytail: today→now; a back-dated note picks its start manually).
      let finalFrom: string | null = null;
      let finalTo: string | null = null;
      if (timeMode === 'range') {
        finalFrom = timeFrom;
        finalTo = timeTo;
      } else if (durationSec) {
        const now = new Date();
        finalFrom =
          durationStart ?? combineDateTime(entryDate, now.getHours(), now.getMinutes());
        finalTo = new Date(new Date(finalFrom).getTime() + durationSec * 1000).toISOString();
      }

      // Persist new attachments (those without an id) onto an entry.
      const saveNewMedia = async (targetEntryId: number) => {
        for (const m of media) {
          if (m.id == null) {
            await addEntryMedia(targetEntryId, {
              media_type: m.media_type,
              file_path: m.file_path,
              thumbnail_path: m.thumbnail_path,
              duration_sec: m.duration_sec,
            });
          }
        }
      };

      let refreshDayId = dayId;

      if (isEdit && entryId != null) {
        await editEntry(
          entryId,
          {
            activity_type: activityType,
            is_overtime: isOvertime,
            title: title.trim() || null,
            body: body.trim() || null,
            project_id: selectedProjectId,
            duration_sec: durationSec,
            time_from: finalFrom,
            time_to: finalTo,
            tagIds: selectedTags.map(t => t.id),
          },
          dayId,
        );
        // Detach removed existing attachments, then add new ones.
        for (const m of removedMedia) {
          if (m.id != null) { await deleteEntryMedia(m.id); }
        }
        await saveNewMedia(entryId);
      } else {
        const gps = getLastKnownPosition();
        // A to-do is attached to the day it's scheduled for, not today's day.
        // A subnote lives on its parent's day and inherits its project.
        const targetDayId = parent
          ? parent.day_id
          : isTodo ? (await getOrCreateDay(scheduledDate)).id : dayId;
        refreshDayId = targetDayId;
        const reminderIso = isTodo && reminderEnabled ? reminderAt : null;
        const created = await addEntry({
          day_id: targetDayId,
          entry_type: 'note',
          activity_type: activityType,
          is_overtime: isOvertime,
          title: title.trim() || null,
          body: body.trim() || null,
          project_id: parent ? parent.project_id : selectedProjectId,
          parent_id: parent?.id ?? null,
          tagIds: selectedTags.map(t => t.id),
          duration_sec: durationSec,
          time_from: finalFrom,
          time_to: finalTo,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
          is_todo: isTodo,
          scheduled_date: isTodo ? scheduledDate : null,
          reminder_at: reminderIso,
        });
        await saveNewMedia(created.id);
        if (reminderIso) {
          scheduleTodoReminder(created).catch(() => {});
        }
      }

      await cleanupRemovedFiles();
      // Reload so the day reflects the freshly attached/removed media.
      await loadEntriesForDay(refreshDayId);
      Vibration.vibrate(40);
      navigation.goBack();
    } catch (e) {
      Alert.alert(translate('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const activeProjects = projects.filter(p => !p.archived);
  const tagSuggestions = tags
    .filter(
      t =>
        tagInput.length > 0 &&
        t.name.toLowerCase().startsWith(tagInput.toLowerCase()) &&
        !selectedTags.find(s => s.id === t.id),
    )
    .slice(0, 5);

  if (loadingEntry) {
    return null;
  }

  const tabs = canSwitchTabs && (
    <View style={styles.tabRow}>
      {(['note', 'leave'] as const).map(tab => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, editorTab === tab && styles.tabActive]}
          onPress={() => setEditorTab(tab)}
          accessibilityRole="tab"
          accessibilityState={{selected: editorTab === tab}}
          accessibilityLabel={translate(`entries.${tab}Tab`)}>
          <Text style={[
            styles.tabText,
            editorTab === tab && styles.tabTextActive,
          ]}>
            {translate(`entries.${tab}Tab`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (editorTab === 'leave') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {tabs}
          <LeaveEditor
            initialDate={entryDate}
            leaveRangeId={leaveRangeId}
            onSaved={() => navigation.goBack()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, {paddingBottom: spacing.xxl + kbHeight}]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">

      {tabs}
      {parent && (
        <Text style={styles.subnoteOf} numberOfLines={1}>
          {translate('subnotes.subnoteOf')}: {parent.title || parent.body || translate('subnotes.untitled')}
        </Text>
      )}
      <Text style={styles.sectionLabel}>{translate('entries.activity')}</Text>
      <View style={styles.activityRow}>
        {ACTIVITY_TYPES.map(({type, labelKey}) => (
          <TouchableOpacity
            key={type}
            style={[styles.activityBtn, activityType === type && styles.activityBtnActive]}
            onPress={() => {
              setActivityType(type);
              if (type !== 'work') {
                setIsOvertime(false);
              }
            }}
            activeOpacity={0.7}>
            <Text style={[styles.activityLabel, activityType === type && styles.activityLabelActive]}>
              {translate(labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activityType === 'work' && (
        <TouchableOpacity
          style={styles.todoRow}
          onPress={() => setIsOvertime(value => !value)}
          accessibilityRole="checkbox"
          accessibilityState={{checked: isOvertime}}
          accessibilityLabel={translate('entries.overtime')}>
          <Text style={styles.todoLabel}>{translate('entries.overtime')}</Text>
          <View style={[styles.todoToggle, isOvertime && styles.todoToggleOn]}>
            <Text style={[
              styles.todoToggleText,
              isOvertime && styles.todoToggleTextOn,
            ]}>
              {isOvertime ? translate('common.on') : translate('common.off')}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>{translate('entries.attachments')}</Text>
      <AttachmentsSection media={media} onAdd={addMedia} onRemove={removeMedia} />

      <Text style={styles.sectionLabel}>{translate('entries.titleOptional')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onLayout={rememberY('title')}
        onFocus={onFieldFocus('title')}
        placeholder={translate('entries.titlePlaceholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={120}
      />

      <Text style={styles.sectionLabel}>{translate('entries.note')}</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={body}
        onChangeText={setBody}
        onLayout={rememberY('body')}
        onFocus={onFieldFocus('body')}
        placeholder={translate('entries.notePlaceholder')}
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      {!parent && <View onLayout={rememberY('project')}>
        <Text style={styles.sectionLabel}>{translate('entries.projectOptional')}</Text>
        <ProjectPicker
          projects={activeProjects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onCreate={addProject}
          onSearchFocus={onFieldFocus('project')}
        />
      </View>}

      <Text style={styles.sectionLabel}>{translate('entries.tags')}</Text>
      <View style={styles.tagInputRow} onLayout={rememberY('tags')}>
        <TextInput
          style={[styles.input, styles.tagInput]}
          value={tagInput}
          onChangeText={setTagInput}
          onFocus={onFieldFocus('tags')}
          placeholder={translate('entries.tagPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          onSubmitEditing={() => addTag(tagInput)}
          blurOnSubmit={false}
        />
        {tagInput.trim().length > 0 && (
          <TouchableOpacity style={styles.tagAddBtn} onPress={() => addTag(tagInput)}>
            <Text style={styles.tagAddBtnText}>{translate('common.add')}</Text>
          </TouchableOpacity>
        )}
      </View>
      {tagSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          {tagSuggestions.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => { setSelectedTags(prev => [...prev, t]); setTagInput(''); }}>
              <Text style={styles.suggestion}>#{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {selectedTags.length > 0 && (
        <View style={styles.tagChips}>
          {selectedTags.map(t => (
            <TouchableOpacity key={t.id} onPress={() => removeTag(t.id)}>
              <TagChip name={t.name} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.sectionLabel}>{translate('entries.timeTrackingOptional')}</Text>
      <View style={styles.timeModeRow}>
        {(['none', 'duration', 'range'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.timeModeBtn, timeMode === mode && styles.timeModeBtnActive]}
            onPress={() => setTimeMode(mode)}>
            <Text style={[styles.timeModeBtnText, timeMode === mode && styles.timeModeBtnTextActive]}>
              {mode === 'none'
                ? translate('entries.noTimeTracking')
                : mode === 'duration'
                ? translate('entries.duration')
                : translate('entries.fromTo')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {timeMode === 'duration' && (
        <>
          <View style={styles.durationRow} onLayout={rememberY('duration')}>
            <TextInput
              style={[styles.input, styles.durationInput]}
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              onFocus={onFieldFocus('duration')}
              placeholder={translate('entries.minutes')}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={5}
            />
            <Text style={styles.durationUnit}>{translate('entries.minuteUnit')}</Text>
          </View>
          <View style={styles.durationStartBlock}>
            <Text style={styles.rangeLabel}>{translate('entries.startOptional')}</Text>
            <TimePicker value={durationStart} baseDate={entryDate} onChange={setDurationStart} />
          </View>
        </>
      )}

      {timeMode === 'range' && (
        <View style={styles.rangeRow}>
          <View style={styles.rangeBlock}>
            <Text style={styles.rangeLabel}>{translate('common.from')}</Text>
            <TimePicker value={timeFrom} baseDate={entryDate} onChange={setTimeFrom} />
          </View>
          <Text style={styles.rangeSep}>→</Text>
          <View style={styles.rangeBlock}>
            <Text style={styles.rangeLabel}>{translate('common.to')}</Text>
            <TimePicker value={timeTo} baseDate={entryDate} onChange={setTimeTo} />
          </View>
        </View>
      )}

      {!isEdit && !parent && (
        <>
          <TouchableOpacity
            style={styles.todoRow}
            onPress={() => setIsTodo(v => !v)}
            activeOpacity={0.7}>
            <Text style={styles.todoLabel}>{translate('todo.schedule')}</Text>
            <View style={[styles.todoToggle, isTodo && styles.todoToggleOn]}>
              <Text style={[styles.todoToggleText, isTodo && styles.todoToggleTextOn]}>
                {isTodo ? translate('common.on') : translate('common.off')}
              </Text>
            </View>
          </TouchableOpacity>
          {isTodo && (
            <>
              <TouchableOpacity style={styles.scheduleBtn} onPress={() => setShowSchedulePicker(true)}>
                <Text style={styles.scheduleLabel}>{translate('todo.scheduledFor')}</Text>
                <Text style={styles.scheduleValue}>{formatDate(scheduledDate)}</Text>
              </TouchableOpacity>
              <Text style={styles.todoHint}>{translate('todo.scheduleHint')}</Text>
              {showSchedulePicker && (
                <DateTimePicker
                  value={new Date(`${scheduledDate}T12:00:00`)}
                  mode="date"
                  display={Platform.OS === 'android' ? 'default' : 'spinner'}
                  minimumDate={new Date()}
                  onChange={(_e, d) => {
                    setShowSchedulePicker(false);
                    if (d) { setScheduledDate(localDateStr(d)); }
                  }}
                />
              )}

              <TouchableOpacity style={styles.todoRow} onPress={toggleReminder} activeOpacity={0.7}>
                <Text style={styles.todoLabel}>{translate('todo.remindMe')}</Text>
                <View style={[styles.todoToggle, reminderEnabled && styles.todoToggleOn]}>
                  <Text style={[styles.todoToggleText, reminderEnabled && styles.todoToggleTextOn]}>
                    {reminderEnabled ? translate('common.on') : translate('common.off')}
                  </Text>
                </View>
              </TouchableOpacity>
              {reminderEnabled && (
                <View style={styles.reminderRow}>
                  <Text style={styles.rangeLabel}>{translate('todo.reminderTime')}</Text>
                  <TimePicker
                    value={reminderAt}
                    baseDate={scheduledDate}
                    onChange={setReminderAt}
                  />
                </View>
              )}
            </>
          )}
        </>
      )}

      <View style={styles.saveRow}>
        <Button
          label={isEdit ? translate('common.update') : translate('common.save')}
          onPress={handleSave}
          loading={isSaving}
          style={styles.saveBtn}
        />
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
