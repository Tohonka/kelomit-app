import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  AppState,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore, type WidgetVoiceMode} from '../../store/settingsStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {
  isWidgetBridgeAvailable,
  nativeGetWidgets,
  nativeRequestPinWidget,
  type WidgetInfo,
} from '../../native/widgetSession';
import type {RootStackScreenProps} from '../../navigation/navigationTypes';

type Props = RootStackScreenProps<'WidgetSettings'>;

const VOICE_MODES: {mode: WidgetVoiceMode; labelKey: string}[] = [
  {mode: 'confirm', labelKey: 'widgets.voiceModeConfirm'},
  {mode: 'auto', labelKey: 'widgets.voiceModeAuto'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {paddingBottom: spacing.xxl},
    intro: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    empty: {
      padding: spacing.xl,
      gap: spacing.sm,
    },
    emptyText: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      lineHeight: 22,
    },
    sectionLabel: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
    },
    modeBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    modeLabel: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    modeLabelActive: {color: c.primary, fontWeight: typography.weights.semibold},
    hint: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.xs,
    },
    autoTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
      minHeight: 44,
    },
    autoTitleLabel: {fontSize: typography.sizes.base, color: c.textPrimary},
    autoTitleValue: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.primary,
    },
    addRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
    },
    addBtn: {
      flex: 1,
      flexBasis: '45%',
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.white,
    },
    widgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: 56,
      gap: spacing.sm,
    },
    widgetRowText: {flex: 1},
    widgetRowName: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    widgetRowType: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      marginTop: 1,
    },
    chevron: {
      fontSize: typography.sizes.lg,
      color: c.textMuted,
    },
  });

/**
 * Lists every placed home-screen session widget as a thin row; tapping one
 * opens WidgetEdit. Global widget behavior (voice mode) lives up top.
 */
export default function WidgetSettings({navigation}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    widget_voice_mode,
    setWidgetVoiceMode,
    widget_voice_auto_title,
    setWidgetVoiceAutoTitle,
  } = useSettingsStore();

  const [widgets, setWidgets] = useState<WidgetInfo[]>([]);
  const available = isWidgetBridgeAvailable();

  const refresh = useCallback(async () => {
    setWidgets(await nativeGetWidgets());
  }, []);

  useEffect(() => {
    if (available) { refresh().catch(() => {}); }
  }, [available, refresh]);

  // Names are edited on WidgetEdit; re-read on the way back so rows update.
  useEffect(() => {
    if (!available) { return; }
    return navigation.addListener('focus', () => refresh().catch(() => {}));
  }, [available, navigation, refresh]);

  // The pin flow hands off to the launcher's overlay; refresh on return so a
  // freshly placed widget appears in the list without leaving the screen.
  useEffect(() => {
    if (!available) { return; }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') { refresh().catch(() => {}); }
    });
    return () => sub.remove();
  }, [available, refresh]);

  const handleAddWidget = async (type: 'full' | 'toggle' | 'addnote' | 'tracking') => {
    const ok = await nativeRequestPinWidget(type).catch(() => false);
    if (!ok) {
      Alert.alert(t('widgets.pinUnsupportedTitle'), t('widgets.pinUnsupported'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('widgets.intro')}</Text>

        <Text style={styles.sectionLabel}>{t('widgets.voiceMode')}</Text>
        <View style={styles.modeRow}>
          {VOICE_MODES.map(({mode, labelKey}) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modeBtn, widget_voice_mode === mode && styles.modeBtnActive]}
              onPress={() => setWidgetVoiceMode(mode).catch(() => {})}>
              <Text
                style={[
                  styles.modeLabel,
                  widget_voice_mode === mode && styles.modeLabelActive,
                ]}>
                {t(labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>
          {t(
            widget_voice_mode === 'auto'
              ? 'widgets.voiceModeAutoHint'
              : 'widgets.voiceModeConfirmHint',
          )}
        </Text>

        {widget_voice_mode === 'confirm' && (
          <>
            <TouchableOpacity
              style={styles.autoTitleRow}
              onPress={() =>
                setWidgetVoiceAutoTitle(!widget_voice_auto_title).catch(() => {})
              }>
              <Text style={styles.autoTitleLabel}>{t('widgets.voiceAutoTitle')}</Text>
              <Text style={styles.autoTitleValue}>
                {widget_voice_auto_title ? t('common.on') : t('common.off')}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>{t('widgets.voiceAutoTitleHint')}</Text>
          </>
        )}

        {available && (
          <>
            <Text style={styles.sectionLabel}>{t('widgets.addSection')}</Text>
            <View style={styles.addRow}>
              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddWidget('full')}>
                <Text style={styles.addBtnText}>{t('widgets.addFull')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddWidget('toggle')}>
                <Text style={styles.addBtnText}>{t('widgets.addToggle')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddWidget('addnote')}>
                <Text style={styles.addBtnText}>{t('widgets.addAddNote')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={() => handleAddWidget('tracking')}>
                <Text style={styles.addBtnText}>{t('widgets.addTracking')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {(!available || widgets.length === 0) && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {available ? t('widgets.none') : t('widgets.unavailable')}
            </Text>
          </View>
        )}

        {widgets.length > 0 && (
          <Text style={styles.sectionLabel}>{t('widgets.placedSection')}</Text>
        )}
        {widgets.map(w => {
          const typeLabel = t(w.type === 'toggle' ? 'widgets.typeToggle' : 'widgets.typeFull');
          const name = w.config?.name?.trim();
          return (
            <TouchableOpacity
              key={w.appWidgetId}
              style={styles.widgetRow}
              onPress={() => navigation.navigate('WidgetEdit', {appWidgetId: w.appWidgetId})}>
              <View style={styles.widgetRowText}>
                <Text style={styles.widgetRowName} numberOfLines={1}>
                  {name || typeLabel}
                </Text>
                {!!name && <Text style={styles.widgetRowType}>{typeLabel}</Text>}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
