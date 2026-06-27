import React, {useState, useEffect, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {useEntryStore} from '../store/entryStore';
import {useSettingsStore} from '../store/settingsStore';
import {useTagStore} from '../store/tagStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import AttachmentsSection, {type EditorMedia} from '../components/media/AttachmentsSection';
import {ensureMediaDir} from '../utils/mediaUtils';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import {addEntryMedia} from '../db/entries';
import {getLastKnownPosition} from '../services/gpsService';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'QuickAddModal'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm},
    heading: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
    },
    defaultsNote: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      marginBottom: spacing.md,
    },
    sectionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
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
    durationRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    durationInput: {flex: 1, textAlign: 'center'},
    durationUnit: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    saveRow: {marginTop: spacing.xl},
  });

export default function QuickAddModal({navigation, route}: Props) {
  const {dayId, entryType} = route.params;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {addEntry, loadEntriesForDay} = useEntryStore();
  const {getOrCreate} = useTagStore();
  const {
    loaded: settingsLoaded,
    load: loadSettings,
    quickadd_default_activity,
    quickadd_default_project_id,
    quickadd_default_tag,
  } = useSettingsStore();

  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [media, setMedia] = useState<EditorMedia[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) { loadSettings(); }
    ensureMediaDir().catch(() => {});
  }, [settingsLoaded, loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const durationSec = durationMinutes.trim()
        ? Math.round(parseFloat(durationMinutes) * 60)
        : null;

      const tagName = quickadd_default_tag.trim();
      const tagIds: number[] = [];
      if (tagName) {
        const tag = await getOrCreate(tagName);
        tagIds.push(tag.id);
      }

      const gps = getLastKnownPosition();
      const created = await addEntry({
        day_id: dayId,
        entry_type: 'note',
        activity_type: quickadd_default_activity,
        title: title.trim() || null,
        body: null,
        project_id: quickadd_default_project_id,
        tagIds,
        duration_sec: durationSec,
        time_from: null,
        time_to: null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
      });
      for (const m of media) {
        await addEntryMedia(created.id, {
          media_type: m.media_type,
          file_path: m.file_path,
          thumbnail_path: m.thumbnail_path,
          duration_sec: m.duration_sec,
        });
      }
      await loadEntriesForDay(dayId);
      haptic(HAPTIC_SAVE);
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{t(`quickEntryType.${entryType}`)}</Text>
      <Text style={styles.defaultsNote}>
        {t('entries.quickDefaults', {
          activity: t(`activity.${quickadd_default_activity}`),
          tag: quickadd_default_tag.trim() ? ` · #${quickadd_default_tag.trim()}` : '',
        })}
      </Text>

      <AttachmentsSection
        media={media}
        onAdd={m => setMedia(prev => [...prev, m])}
        onRemove={i => setMedia(prev => prev.filter((_, idx) => idx !== i))}
      />

      <Text style={styles.sectionLabel}>{t('entries.title')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('entries.quickTitlePlaceholder')}
        placeholderTextColor={colors.textMuted}
        autoFocus={entryType === 'note'}
        maxLength={120}
      />

      <Text style={styles.sectionLabel}>{t('entries.durationOptional')}</Text>
      <View style={styles.durationRow}>
        <TextInput
          style={[styles.input, styles.durationInput]}
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          placeholder={t('entries.minutes')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          maxLength={5}
        />
        <Text style={styles.durationUnit}>{t('entries.minuteUnit')}</Text>
      </View>

      <View style={styles.saveRow}>
        <Button label={t('common.save')} onPress={handleSave} loading={isSaving} />
      </View>
    </ScrollView>
  );
}
