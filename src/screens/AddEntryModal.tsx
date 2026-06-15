import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
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
import PhotoCapture from '../components/media/PhotoCapture';
import VideoCapture from '../components/media/VideoCapture';
import VoiceRecorder from '../components/media/VoiceRecorder';
import {deleteMediaFile, ensureMediaDir} from '../utils/mediaUtils';
import {getLastKnownPosition} from '../services/gpsService';
import {getEntry} from '../db/entries';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {EntryType, ActivityType, Tag} from '../types';

type Props = RootStackScreenProps<'AddEntryModal'>;

const ENTRY_TYPES: {type: EntryType; label: string; emoji: string}[] = [
  {type: 'note', label: 'Note', emoji: '✏️'},
  {type: 'photo', label: 'Photo', emoji: '📷'},
  {type: 'video', label: 'Video', emoji: '🎥'},
  {type: 'voice', label: 'Voice', emoji: '🎙️'},
];

const ACTIVITY_TYPES: {type: ActivityType; label: string}[] = [
  {type: 'work', label: 'Work'},
  {type: 'personal_work', label: 'Personal (work)'},
  {type: 'personal', label: 'Personal'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl},
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
  });

export default function AddEntryModal({navigation, route}: Props) {
  const {dayId, entryId} = route.params;
  const entryDate = route.params.date;
  const isEdit = entryId != null;
  const {addEntry, editEntry} = useEntryStore();
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

  const [entryType, setEntryType] = useState<EntryType>('note');
  const [activityType, setActivityType] = useState<ActivityType>('work');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(isEdit);

  const [filePath, setFilePath] = useState<string | null>(null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[]>([]);

  type TimeMode = 'none' | 'duration' | 'range';
  const [timeMode, setTimeMode] = useState<TimeMode>('none');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [timeFrom, setTimeFrom] = useState<string | null>(null);
  const [timeTo, setTimeTo] = useState<string | null>(null);
  const defaultsApplied = useRef(false);

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

  // Pre-fill fields when editing
  useEffect(() => {
    if (!isEdit || entryId == null) {
      return;
    }
    getEntry(entryId).then(e => {
      if (!e) { return; }
      setEntryType(e.entry_type);
      setActivityType(e.activity_type);
      setTitle(e.title ?? '');
      setBody(e.body ?? '');
      setSelectedProjectId(e.project_id);
      setSelectedTags(e.tags ?? []);
      setFilePath(e.file_path);
      setThumbnailPath(e.thumbnail_path);
      if (e.duration_sec != null) {
        setTimeMode('duration');
        setDurationMinutes(String(Math.round(e.duration_sec / 60)));
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

  const rememberMediaForDeletion = (...paths: Array<string | null>) => {
    setPendingDeletePaths(prev => [
      ...prev,
      ...paths.filter((path): path is string => path != null),
    ]);
  };

  const setMedia = (nextFilePath: string | null, nextThumbnailPath: string | null) => {
    if (filePath && filePath !== nextFilePath) {
      rememberMediaForDeletion(filePath);
    }
    if (
      thumbnailPath &&
      thumbnailPath !== filePath &&
      thumbnailPath !== nextFilePath &&
      thumbnailPath !== nextThumbnailPath
    ) {
      rememberMediaForDeletion(thumbnailPath);
    }
    setFilePath(nextFilePath);
    setThumbnailPath(nextThumbnailPath);
  };

  const handleEntryTypeChange = (type: EntryType) => {
    if (isEdit || type === entryType) {
      return;
    }
    setMedia(null, null);
    setEntryType(type);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const durationSec =
        timeMode === 'duration' && durationMinutes.trim()
          ? Math.round(parseFloat(durationMinutes) * 60)
          : null;

      if (isEdit && entryId != null) {
        await editEntry(
          entryId,
          {
            activity_type: activityType,
            title: title.trim() || null,
            body: body.trim() || null,
            project_id: selectedProjectId,
            file_path: filePath,
            thumbnail_path: thumbnailPath,
            duration_sec: durationSec,
            time_from: timeMode === 'range' ? timeFrom : null,
            time_to: timeMode === 'range' ? timeTo : null,
            tagIds: selectedTags.map(t => t.id),
          },
          dayId,
        );
      } else {
        const gps = getLastKnownPosition();
        await addEntry({
          day_id: dayId,
          entry_type: entryType,
          activity_type: activityType,
          title: title.trim() || null,
          body: body.trim() || null,
          project_id: selectedProjectId,
          tagIds: selectedTags.map(t => t.id),
          file_path: filePath,
          thumbnail_path: thumbnailPath,
          duration_sec: durationSec,
          time_from: timeMode === 'range' ? timeFrom : null,
          time_to: timeMode === 'range' ? timeTo : null,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
        });
      }
      const pathsToDelete = [...new Set(
        pendingDeletePaths.filter(
          path => path !== filePath && path !== thumbnailPath,
        ),
      )];
      await Promise.all(pathsToDelete.map(deleteMediaFile));
      Vibration.vibrate(40);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', String(e));
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, {paddingBottom: spacing.xxl + kbHeight}]}
        keyboardShouldPersistTaps="handled">

      <Text style={styles.sectionLabel}>Type</Text>
      <View style={styles.typeRow}>
        {ENTRY_TYPES.map(({type, label, emoji}) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.typeBtn,
              entryType === type && styles.typeBtnActive,
              isEdit && styles.typeBtnDisabled,
            ]}
            onPress={() => handleEntryTypeChange(type)}
            activeOpacity={isEdit ? 1 : 0.7}>
            <Text style={styles.typeEmoji}>{emoji}</Text>
            <Text style={[styles.typeLabel, entryType === type && styles.typeLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Activity</Text>
      <View style={styles.activityRow}>
        {ACTIVITY_TYPES.map(({type, label}) => (
          <TouchableOpacity
            key={type}
            style={[styles.activityBtn, activityType === type && styles.activityBtnActive]}
            onPress={() => setActivityType(type)}
            activeOpacity={0.7}>
            <Text style={[styles.activityLabel, activityType === type && styles.activityLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {entryType === 'photo' && (
        <>
          <Text style={styles.sectionLabel}>Photo</Text>
          <PhotoCapture
            filePath={filePath}
            onCapture={(fp, tp) => setMedia(fp, tp)}
          />
        </>
      )}
      {entryType === 'video' && (
        <>
          <Text style={styles.sectionLabel}>Video</Text>
          <VideoCapture
            filePath={filePath}
            onCapture={(fp, tp) => setMedia(fp, tp)}
          />
        </>
      )}
      {entryType === 'voice' && (
        <>
          <Text style={styles.sectionLabel}>Voice recording</Text>
          <VoiceRecorder
            filePath={filePath}
            onRecord={(fp, durSec) => {
              setMedia(fp, null);
              setDurationMinutes(String(Math.round(durSec / 60)));
              setTimeMode('duration');
            }}
            onDiscard={() => {
              setMedia(null, null);
              setDurationMinutes('');
              setTimeMode('none');
            }}
          />
        </>
      )}

      <Text style={styles.sectionLabel}>Title (optional)</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        onLayout={rememberY('title')}
        onFocus={onFieldFocus('title')}
        placeholder="Short title…"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
      />

      <Text style={styles.sectionLabel}>Note</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={body}
        onChangeText={setBody}
        onLayout={rememberY('body')}
        onFocus={onFieldFocus('body')}
        placeholder="Write something…"
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      <View onLayout={rememberY('project')}>
        <Text style={styles.sectionLabel}>Project (optional)</Text>
        <ProjectPicker
          projects={activeProjects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onCreate={addProject}
          onSearchFocus={onFieldFocus('project')}
        />
      </View>

      <Text style={styles.sectionLabel}>Tags</Text>
      <View style={styles.tagInputRow} onLayout={rememberY('tags')}>
        <TextInput
          style={[styles.input, styles.tagInput]}
          value={tagInput}
          onChangeText={setTagInput}
          onFocus={onFieldFocus('tags')}
          placeholder="Add a tag…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          onSubmitEditing={() => addTag(tagInput)}
          blurOnSubmit={false}
        />
        {tagInput.trim().length > 0 && (
          <TouchableOpacity style={styles.tagAddBtn} onPress={() => addTag(tagInput)}>
            <Text style={styles.tagAddBtnText}>Add</Text>
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

      <Text style={styles.sectionLabel}>Time tracking (optional)</Text>
      <View style={styles.timeModeRow}>
        {(['none', 'duration', 'range'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[styles.timeModeBtn, timeMode === mode && styles.timeModeBtnActive]}
            onPress={() => setTimeMode(mode)}>
            <Text style={[styles.timeModeBtnText, timeMode === mode && styles.timeModeBtnTextActive]}>
              {mode === 'none' ? 'None' : mode === 'duration' ? 'Duration' : 'From → To'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {timeMode === 'duration' && (
        <View style={styles.durationRow} onLayout={rememberY('duration')}>
          <TextInput
            style={[styles.input, styles.durationInput]}
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            onFocus={onFieldFocus('duration')}
            placeholder="Minutes"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={5}
          />
          <Text style={styles.durationUnit}>min</Text>
        </View>
      )}

      {timeMode === 'range' && (
        <View style={styles.rangeRow}>
          <View style={styles.rangeBlock}>
            <Text style={styles.rangeLabel}>From</Text>
            <TimePicker value={timeFrom} baseDate={entryDate} onChange={setTimeFrom} />
          </View>
          <Text style={styles.rangeSep}>→</Text>
          <View style={styles.rangeBlock}>
            <Text style={styles.rangeLabel}>To</Text>
            <TimePicker value={timeTo} baseDate={entryDate} onChange={setTimeTo} />
          </View>
        </View>
      )}

      <View style={styles.saveRow}>
        <Button
          label={isEdit ? 'Update' : 'Save'}
          onPress={handleSave}
          loading={isSaving}
          style={styles.saveBtn}
        />
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
