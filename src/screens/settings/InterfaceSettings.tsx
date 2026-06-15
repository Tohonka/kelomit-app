import React, {useMemo} from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme} from '../../theme';
import type {ThemeMode, TimeSelectorMode} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';

const THEME_MODES: {mode: ThemeMode; label: string}[] = [
  {mode: 'system', label: 'Auto'},
  {mode: 'light', label: 'Light'},
  {mode: 'dark', label: 'Dark'},
];

const TIME_MODES: {mode: TimeSelectorMode; label: string}[] = [
  {mode: 'clock', label: 'Clock'},
  {mode: 'keyboard', label: 'Type'},
];

export default function InterfaceSettings() {
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const {
    theme_mode, setThemeMode,
    show_week_numbers, setShowWeekNumbers,
    time_selector_mode, setTimeSelectorMode,
  } = useSettingsStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Appearance</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Theme</Text>
          <View style={styles.segment}>
            {THEME_MODES.map(({mode, label}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, theme_mode === mode && styles.segmentBtnActive]}
                onPress={() => setThemeMode(mode)}>
                <Text style={[styles.segmentBtnText, theme_mode === mode && styles.segmentBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.row} onPress={() => setShowWeekNumbers(!show_week_numbers)}>
          <Text style={styles.rowLabel}>Week numbers</Text>
          <View style={[styles.toggle, show_week_numbers && styles.toggleOn]}>
            <Text style={[styles.toggleText, show_week_numbers && styles.toggleTextOn]}>
              {show_week_numbers ? 'On' : 'Off'}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Time entry</Text>

        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Time selector</Text>
            <Text style={styles.rowSubLabel}>
              {time_selector_mode === 'clock' ? 'Analog clock dialog' : 'Type the time directly'}
            </Text>
          </View>
          <View style={styles.segment}>
            {TIME_MODES.map(({mode, label}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.segmentBtn, time_selector_mode === mode && styles.segmentBtnActive]}
                onPress={() => setTimeSelectorMode(mode)}>
                <Text style={[styles.segmentBtnText, time_selector_mode === mode && styles.segmentBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
