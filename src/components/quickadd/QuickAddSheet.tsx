import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
  Keyboard,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import Button from '../ui/Button';
import AttachmentsSection, {type EditorMedia} from '../media/AttachmentsSection';
import {ensureMediaDir} from '../../utils/mediaUtils';
import {haptic, HAPTIC_SAVE} from '../../utils/haptics';
import {shouldDismiss} from './sheetGesture';
import {useSaveQuickNote} from './useSaveQuickNote';

interface Props {
  visible: boolean;
  dayId: number;
  onClose: () => void;
  onSaved: () => void;
}

const SPRING = {damping: 18, stiffness: 180};

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    fill: {...StyleSheet.absoluteFill, justifyContent: 'flex-end'},
    backdrop: {...StyleSheet.absoluteFill, backgroundColor: '#000'},
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      maxHeight: '90%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    heading: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.black,
      color: c.textPrimary,
    },
    defaultsNote: {fontSize: typography.sizes.xs, color: c.textMuted, marginBottom: spacing.md},
    sectionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
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

export default function QuickAddSheet({visible, dayId, onClose, onSaved}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {height: screenH} = useWindowDimensions();

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
  const [sheetH, setSheetH] = useState(screenH * 0.6);

  const translateY = useSharedValue(screenH);

  useEffect(() => {
    if (!settingsLoaded) { loadSettings(); }
    ensureMediaDir().catch(() => {});
  }, [settingsLoaded, loadSettings]);

  // Open / close driven by `visible`.
  useEffect(() => {
    translateY.value = withSpring(visible ? 0 : screenH, SPRING);
    if (!visible) { Keyboard.dismiss(); }
  }, [visible, screenH, translateY]);

  const close = () => {
    translateY.value = withTiming(screenH, {duration: 220}, finished => {
      if (finished) { runOnJS(onClose)(); }
    });
  };

  const onLayout = (e: LayoutChangeEvent) => setSheetH(e.nativeEvent.layout.height);

  const pan = Gesture.Pan()
    .onUpdate(e => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd(e => {
      if (shouldDismiss(e.translationY, e.velocityY, sheetH)) {
        translateY.value = withTiming(screenH, {duration: 220}, finished => {
          if (finished) { runOnJS(onClose)(); }
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, screenH],
      [0.5, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const resetForm = () => {
    setTitle('');
    setDurationMinutes('');
    setMedia([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveQuickNote({dayId, title, durationMinutes, media});
      haptic(HAPTIC_SAVE);
      resetForm();
      onSaved();
      close();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.fill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} onTouchStart={close} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, sheetStyle]} onLayout={onLayout}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{t('quickEntryType.note')}</Text>
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
              autoFocus
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
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
