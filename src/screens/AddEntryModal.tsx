import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {useEntryStore} from '../store/entryStore';
import {useProjectStore} from '../store/projectStore';
import {useTagStore} from '../store/tagStore';
import {colors, typography, spacing, radius} from '../theme';
import Button from '../components/ui/Button';
import TagChip from '../components/entries/TagChip';
import TimePicker from '../components/ui/TimePicker';
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

export default function AddEntryModal({navigation, route}: Props) {
  const {dayId} = route.params;
  const {addEntry} = useEntryStore();
  const {projects, loaded: projectsLoaded, load: loadProjects} = useProjectStore();
  const {tags, loaded: tagsLoaded, load: loadTags, getOrCreate} = useTagStore();

  const [entryType, setEntryType] = useState<EntryType>('note');
  const [activityType, setActivityType] = useState<ActivityType>('work');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Time tracking
  type TimeMode = 'none' | 'duration' | 'range';
  const [timeMode, setTimeMode] = useState<TimeMode>('none');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [timeFrom, setTimeFrom] = useState<string | null>(null);
  const [timeTo, setTimeTo] = useState<string | null>(null);

  useEffect(() => {
    if (!projectsLoaded) {
      loadProjects();
    }
    if (!tagsLoaded) {
      loadTags();
    }
  }, [projectsLoaded, tagsLoaded, loadProjects, loadTags]);

  const addTag = async (name: string) => {
    const n = name.trim();
    if (!n) {
      return;
    }
    const already = selectedTags.find(
      t => t.name.toLowerCase() === n.toLowerCase(),
    );
    if (already) {
      setTagInput('');
      return;
    }
    const tag = await getOrCreate(n);
    setSelectedTags(prev => [...prev, tag]);
    setTagInput('');
  };

  const removeTag = (id: number) => {
    setSelectedTags(prev => prev.filter(t => t.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const durationSec =
        timeMode === 'duration' && durationMinutes.trim()
          ? Math.round(parseFloat(durationMinutes) * 60)
          : null;

      await addEntry({
        day_id: dayId,
        entry_type: entryType,
        activity_type: activityType,
        title: title.trim() || null,
        body: body.trim() || null,
        project_id: selectedProjectId,
        tagIds: selectedTags.map(t => t.id),
        duration_sec: durationSec,
        time_from: timeMode === 'range' ? timeFrom : null,
        time_to: timeMode === 'range' ? timeTo : null,
      });
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {/* Entry type selector */}
      <Text style={styles.sectionLabel}>Type</Text>
      <View style={styles.typeRow}>
        {ENTRY_TYPES.map(({type, label, emoji}) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeBtn, entryType === type && styles.typeBtnActive]}
            onPress={() => setEntryType(type)}
            activeOpacity={0.7}>
            <Text style={styles.typeEmoji}>{emoji}</Text>
            <Text
              style={[
                styles.typeLabel,
                entryType === type && styles.typeLabelActive,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Activity type */}
      <Text style={styles.sectionLabel}>Activity</Text>
      <View style={styles.activityRow}>
        {ACTIVITY_TYPES.map(({type, label}) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.activityBtn,
              activityType === type && styles.activityBtnActive,
            ]}
            onPress={() => setActivityType(type)}
            activeOpacity={0.7}>
            <Text
              style={[
                styles.activityLabel,
                activityType === type && styles.activityLabelActive,
              ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Title */}
      <Text style={styles.sectionLabel}>Title (optional)</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Short title…"
        placeholderTextColor={colors.textMuted}
        maxLength={120}
      />

      {/* Body */}
      <Text style={styles.sectionLabel}>Note</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={body}
        onChangeText={setBody}
        placeholder="Write something…"
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      {/* Project */}
      <Text style={styles.sectionLabel}>Project (optional)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.projectScroll}>
        <TouchableOpacity
          style={[
            styles.projectChip,
            selectedProjectId == null && styles.projectChipActive,
          ]}
          onPress={() => setSelectedProjectId(null)}>
          <Text
            style={[
              styles.projectChipText,
              selectedProjectId == null && styles.projectChipTextActive,
            ]}>
            None
          </Text>
        </TouchableOpacity>
        {activeProjects.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.projectChip,
              selectedProjectId === p.id && styles.projectChipActive,
            ]}
            onPress={() => setSelectedProjectId(p.id)}>
            <Text
              style={[
                styles.projectChipText,
                selectedProjectId === p.id && styles.projectChipTextActive,
              ]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tags */}
      <Text style={styles.sectionLabel}>Tags</Text>
      <View style={styles.tagInputRow}>
        <TextInput
          style={[styles.input, styles.tagInput]}
          value={tagInput}
          onChangeText={setTagInput}
          placeholder="Add a tag…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          onSubmitEditing={() => addTag(tagInput)}
          blurOnSubmit={false}
        />
        {tagInput.trim().length > 0 && (
          <TouchableOpacity
            style={styles.tagAddBtn}
            onPress={() => addTag(tagInput)}>
            <Text style={styles.tagAddBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>
      {tagSuggestions.length > 0 && (
        <View style={styles.suggestions}>
          {tagSuggestions.map(t => (
            <TouchableOpacity
              key={t.id}
              onPress={() => {
                setSelectedTags(prev => [...prev, t]);
                setTagInput('');
              }}>
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

      {/* Time tracking */}
      <Text style={styles.sectionLabel}>Time tracking (optional)</Text>
      <View style={styles.timeModeRow}>
        {(['none', 'duration', 'range'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.timeModeBtn,
              timeMode === mode && styles.timeModeBtnActive,
            ]}
            onPress={() => setTimeMode(mode)}>
            <Text
              style={[
                styles.timeModeBtnText,
                timeMode === mode && styles.timeModeBtnTextActive,
              ]}>
              {mode === 'none' ? 'None' : mode === 'duration' ? 'Duration' : 'From → To'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {timeMode === 'duration' && (
        <View style={styles.durationRow}>
          <TextInput
            style={[styles.input, styles.durationInput]}
            value={durationMinutes}
            onChangeText={setDurationMinutes}
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
            <TimePicker value={timeFrom} onChange={setTimeFrom} />
          </View>
          <Text style={styles.rangeSep}>→</Text>
          <View style={styles.rangeBlock}>
            <Text style={styles.rangeLabel}>To</Text>
            <TimePicker value={timeTo} onChange={setTimeTo} />
          </View>
        </View>
      )}

      <View style={styles.saveRow}>
        <Button
          label="Save"
          onPress={handleSave}
          loading={isSaving}
          style={styles.saveBtn}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '12',
  },
  typeEmoji: {fontSize: 22},
  typeLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
    marginTop: 4,
  },
  typeLabelActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  activityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  activityBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  activityBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  activityLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  activityLabelActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: spacing.md,
  },
  projectScroll: {
    flexGrow: 0,
  },
  projectChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.bgCard,
  },
  projectChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  projectChipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  projectChipTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  tagInput: {
    flex: 1,
  },
  tagAddBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  tagAddBtnText: {
    color: '#fff',
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.base,
  },
  suggestions: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  saveRow: {
    marginTop: spacing.xl,
  },
  saveBtn: {
    width: '100%',
  },
  timeModeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeModeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
  },
  timeModeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  timeModeBtnText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  timeModeBtnTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  durationInput: {
    flex: 1,
    textAlign: 'center',
  },
  durationUnit: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rangeBlock: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'center',
  },
  rangeLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rangeSep: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
