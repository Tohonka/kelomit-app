import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import type {NavVisibility} from '../../store/settingsStore';
import {useTheme} from '../../theme';
import type {ThemeMode, TimeSelectorMode, ColorTheme} from '../../theme';
import type {Language} from '../../i18n';
import {makeSettingsStyles} from './settingsStyles';

const THEME_MODES: {mode: ThemeMode; labelKey: string}[] = [
  {mode: 'system', labelKey: 'settings.themeAuto'},
  {mode: 'light', labelKey: 'settings.themeLight'},
  {mode: 'dark', labelKey: 'settings.themeDark'},
];

const COLOR_THEMES: {theme: ColorTheme; labelKey: string}[] = [
  {theme: 'default', labelKey: 'settings.colorThemeDefault'},
  {theme: 'hornet', labelKey: 'settings.colorThemeHornet'},
];

const NAV_VISIBILITY_OPTIONS: {mode: NavVisibility; labelKey: string}[] = [
  {mode: 'always', labelKey: 'settings.navVisibilityAlways'},
  {mode: 'home_only', labelKey: 'settings.navVisibilityHomeOnly'},
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
    color_theme, setColorTheme,
    language, setLanguage,
    show_week_numbers, setShowWeekNumbers,
    show_personal_hours, setShowPersonalHours,
    subnotes_expanded, setSubnotesExpanded,
    nav_visibility, setNavVisibility,
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
          <Text style={styles.rowLabel}>{t('settings.colorTheme')}</Text>
          <View style={styles.segment}>
            {COLOR_THEMES.map(({theme: option, labelKey}) => (
              <TouchableOpacity
                key={option}
                style={[styles.segmentBtn, color_theme === option && styles.segmentBtnActive]}
                onPress={() => setColorTheme(option)}>
                <Text style={[styles.segmentBtnText, color_theme === option && styles.segmentBtnTextActive]}>
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

        <TouchableOpacity style={styles.row} onPress={() => setShowPersonalHours(!show_personal_hours)}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.personalHours')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.personalHoursDescription')}</Text>
          </View>
          <View style={[styles.toggle, show_personal_hours && styles.toggleOn]}>
            <Text style={[styles.toggleText, show_personal_hours && styles.toggleTextOn]}>
              {show_personal_hours ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => setSubnotesExpanded(!subnotes_expanded)}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.subnotesExpanded')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.subnotesExpandedDescription')}</Text>
          </View>
          <View style={[styles.toggle, subnotes_expanded && styles.toggleOn]}>
            <Text style={[styles.toggleText, subnotes_expanded && styles.toggleTextOn]}>
              {subnotes_expanded ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>{t('settings.navVisibility')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.navVisibilityDescription')}</Text>
          </View>
          <View style={styles.segment}>
            {NAV_VISIBILITY_OPTIONS.map(({mode, labelKey}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, nav_visibility === mode && styles.segmentBtnActive]}
                onPress={() => setNavVisibility(mode)}>
                <Text style={[styles.segmentBtnText, nav_visibility === mode && styles.segmentBtnTextActive]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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
