import React, {useState, useEffect, useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import AttachmentsSection, {type EditorMedia} from '../components/media/AttachmentsSection';
import {capturePhoto} from '../utils/mediaCapture';
import {ensureMediaDir} from '../utils/mediaUtils';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import {useSaveQuickNote} from '../components/quickadd/useSaveQuickNote';
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
  const {dayId, entryType, autoCapture} = route.params;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const saveQuickNote = useSaveQuickNote();
  const {
    loaded: settingsLoaded,
    load: loadSettings,
    quickadd_default_activity,
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

  // Widget photo flow: open the camera immediately; the shot lands in `media`.
  // Cancelling the camera just leaves the normal quick-add screen.
  const autoCaptured = useRef(false);
  useEffect(() => {
    if (autoCapture && entryType === 'photo' && !autoCaptured.current) {
      autoCaptured.current = true;
      capturePhoto(false)
        .then(m => { if (m) { setMedia(prev => [...prev, m]); } })
        .catch(() => {});
    }
  }, [autoCapture, entryType]);

  // Clear the route's `autoCapture` flag once the auto-action above (photo) or
  // below (voice, via the autoStartVoice prop) has been kicked off. The param
  // otherwise stays `true` for the rest of the screen's life, so any *later*
  // VoiceRecorder remount — after a discard, or tapping the mic again — would
  // see the same live flag and auto-record again, with no way to reach the
  // idle recorder. React commits child effects before parent effects, and
  // AttachmentsSection's initial recording state already latched autoStartVoice
  // in during the first render, so this only ever suppresses *subsequent* mounts.
  useEffect(() => {
    if (autoCapture) {
      navigation.setParams({autoCapture: false});
    }
  }, [autoCapture, navigation]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveQuickNote({dayId, title, durationMinutes, media});
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
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
        autoStartVoice={autoCapture && entryType === 'voice'}
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
