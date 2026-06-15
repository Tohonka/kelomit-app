import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme} from '../../theme';
import type {ThemeMode, TimeSelectorMode} from '../../theme';
import type {Language} from '../../i18n';
import {makeSettingsStyles} from './settingsStyles';

const THEME_MODES: {mode: ThemeMode; labelKey: string}[] = [
  {mode: 'system', labelKey: 'settings.themeAuto'},
  {mode: 'light', labelKey: 'settings.themeLight'},
  {mode: 'dark', labelKey: 'settings.themeDark'},
];

const TIME_MODES: {mode: TimeSelectorMode; labelKey: string}[] = [
  {mode: 'clock', labelKey: 'settings.timeSelectorClock'},
  {mode: 'keyboard', labelKey: 'settings.timeSelectorKeyboard'},
];

const LANGUAGE_OPTIONS: {language: Language; labelKey: string}[] = [
  {language: 'en', labelKey: 'settings.languageEnglish'},
  {language: 'fi', labelKey: 'settings.languageFinnish'},
];

export default function InterfaceSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const {
    theme_mode, setThemeMode,
    language, setLanguage,
    show_week_numbers, setShowWeekNumbers,
    time_selector_mode, setTimeSelectorMode,
  } = useSettingsStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('settings.appearance')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.theme')}</Text>
          <View style={styles.segment}>
            {THEME_MODES.map(({mode, labelKey}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, theme_mode === mode && styles.segmentBtnActive]}
                onPress={() => setThemeMode(mode)}>
                <Text style={[styles.segmentBtnText, theme_mode === mode && styles.segmentBtnTextActive]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('common.language')}</Text>
          <View style={styles.segment}>
            {LANGUAGE_OPTIONS.map(({language: option, labelKey}) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentBtn, language === option && styles.segmentBtnActive]}
                onPress={() => setLanguage(option)}>
                <Text style={[styles.segmentBtnText, language === option && styles.segmentBtnTextActive]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.row} onPress={() => setShowWeekNumbers(!show_week_numbers)}>
          <Text style={styles.rowLabel}>{t('settings.weekNumbers')}</Text>
          <View style={[styles.toggle, show_week_numbers && styles.toggleOn]}>
            <Text style={[styles.toggleText, show_week_numbers && styles.toggleTextOn]}>
              {show_week_numbers ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t('settings.timeEntry')}</Text>

        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>{t('settings.timeSelector')}</Text>
            <Text style={styles.rowSubLabel}>
              {time_selector_mode === 'clock'
                ? t('settings.timeSelectorClockDescription')
                : t('settings.timeSelectorKeyboardDescription')}
            </Text>
          </View>
          <View style={styles.segment}>
            {TIME_MODES.map(({mode, labelKey}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, time_selector_mode === mode && styles.segmentBtnActive]}
                onPress={() => setTimeSelectorMode(mode)}>
                <Text style={[styles.segmentBtnText, time_selector_mode === mode && styles.segmentBtnTextActive]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
