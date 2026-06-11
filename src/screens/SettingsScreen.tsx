import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {subDays, format} from 'date-fns';
import {useSettingsStore} from '../store/settingsStore';
import {startTracking, stopTracking} from '../services/gpsService';
import {exportToCsv} from '../utils/exportUtils';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import type {ThemeMode} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Settings'>;

type ExportState = 'hidden' | 'ready' | 'picking_from' | 'picking_to';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {paddingBottom: spacing.xxl},
    sectionHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      minHeight: 52,
    },
    rowLabel: {fontSize: typography.sizes.base, color: c.textPrimary},
    rowValue: {fontSize: typography.sizes.base, color: c.textMuted},
    rowCaret: {fontSize: typography.sizes.lg, color: c.textMuted},
    toggle: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
    },
    toggleOn: {borderColor: c.success, backgroundColor: c.success + '15'},
    toggleText: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
    },
    toggleTextOn: {color: c.success},
    themeSegment: {
      flexDirection: 'row',
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      padding: 3,
      marginRight: spacing.md,
    },
    themeBtn: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm},
    themeBtnActive: {backgroundColor: c.bgCard},
    themeBtnText: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
    themeBtnTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    exportPanel: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      gap: spacing.md,
    },
    exportDateRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    exportDateBtn: {
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    exportDateLabel: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
      marginBottom: 2,
    },
    exportDateValue: {
      fontSize: typography.sizes.sm,
      color: c.textPrimary,
      fontWeight: typography.weights.semibold,
    },
    exportSep: {fontSize: typography.sizes.base, color: c.textMuted},
    exportBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    exportBtnText: {
      color: c.white,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
  });

const THEME_MODES: {mode: ThemeMode; label: string}[] = [
  {mode: 'system', label: 'Auto'},
  {mode: 'light', label: 'Light'},
  {mode: 'dark', label: 'Dark'},
];

export default function SettingsScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    loaded, load,
    gps_enabled, setGpsEnabled,
    gps_interval_ms,
    default_activity_type,
    theme_mode, setThemeMode,
    show_week_numbers, setShowWeekNumbers,
  } = useSettingsStore();

  const [exportFrom, setExportFrom] = useState<Date>(() => subDays(new Date(), 29));
  const [exportTo, setExportTo] = useState<Date>(new Date());
  const [exportState, setExportState] = useState<ExportState>('hidden');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loaded) { load(); }
  }, [loaded, load]);

  const handleGpsToggle = async () => {
    const next = !gps_enabled;
    await setGpsEnabled(next);
    if (next) { startTracking(gps_interval_ms); } else { stopTracking(); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToCsv(
        format(exportFrom, 'yyyy-MM-dd'),
        format(exportTo, 'yyyy-MM-dd'),
      );
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Appearance</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Theme</Text>
          <View style={styles.themeSegment}>
            {THEME_MODES.map(({mode, label}) => (
              <TouchableOpacity
                key={mode}
                style={[styles.themeBtn, theme_mode === mode && styles.themeBtnActive]}
                onPress={() => setThemeMode(mode)}>
                <Text style={[styles.themeBtnText, theme_mode === mode && styles.themeBtnTextActive]}>
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

        <Text style={styles.sectionHeader}>Tracking</Text>

        <TouchableOpacity style={styles.row} onPress={handleGpsToggle}>
          <Text style={styles.rowLabel}>GPS tracking</Text>
          <View style={[styles.toggle, gps_enabled && styles.toggleOn]}>
            <Text style={[styles.toggleText, gps_enabled && styles.toggleTextOn]}>
              {gps_enabled ? 'On' : 'Off'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default activity</Text>
          <Text style={styles.rowValue}>{default_activity_type}</Text>
        </View>

        <Text style={styles.sectionHeader}>Data</Text>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ProjectsScreen')}>
          <Text style={styles.rowLabel}>Projects</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => setExportState(s => s === 'hidden' ? 'ready' : 'hidden')}>
          <Text style={styles.rowLabel}>Export CSV</Text>
          <Text style={styles.rowCaret}>{exportState !== 'hidden' ? '↓' : '›'}</Text>
        </TouchableOpacity>

        {exportState !== 'hidden' && (
          <View style={styles.exportPanel}>
            <View style={styles.exportDateRow}>
              <TouchableOpacity style={styles.exportDateBtn} onPress={() => setExportState('picking_from')}>
                <Text style={styles.exportDateLabel}>From</Text>
                <Text style={styles.exportDateValue}>{format(exportFrom, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
              <Text style={styles.exportSep}>→</Text>
              <TouchableOpacity style={styles.exportDateBtn} onPress={() => setExportState('picking_to')}>
                <Text style={styles.exportDateLabel}>To</Text>
                <Text style={styles.exportDateValue}>{format(exportTo, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
              <Text style={styles.exportBtnText}>{exporting ? 'Exporting…' : 'Share CSV'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {exportState === 'picking_from' && (
          <DateTimePicker
            value={exportFrom}
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            maximumDate={exportTo}
            onChange={(_e, d) => {
              if (d) { setExportFrom(d); }
              setExportState('ready');
            }}
          />
        )}
        {exportState === 'picking_to' && (
          <DateTimePicker
            value={exportTo}
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            minimumDate={exportFrom}
            maximumDate={new Date()}
            onChange={(_e, d) => {
              if (d) { setExportTo(d); }
              setExportState('ready');
            }}
          />
        )}

        <Text style={styles.sectionHeader}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
