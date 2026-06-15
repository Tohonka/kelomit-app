import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {subDays, format} from 'date-fns';
import {exportToCsv} from '../../utils/exportUtils';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {RootStackScreenProps} from '../../navigation/navigationTypes';
import {makeSettingsStyles} from './settingsStyles';

type Props = RootStackScreenProps<'DataSettings'>;
type ExportState = 'hidden' | 'ready' | 'picking_from' | 'picking_to';

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
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

export default function DataSettings({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const [exportFrom, setExportFrom] = useState<Date>(() => subDays(new Date(), 29));
  const [exportTo, setExportTo] = useState<Date>(new Date());
  const [exportState, setExportState] = useState<ExportState>('hidden');
  const [exporting, setExporting] = useState(false);

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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Data</Text>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ProjectsScreen')}>
          <Text style={styles.rowLabel}>Projects</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => setExportState(s => (s === 'hidden' ? 'ready' : 'hidden'))}>
          <Text style={styles.rowLabel}>Export CSV</Text>
          <Text style={styles.rowCaret}>{exportState !== 'hidden' ? '↓' : '›'}</Text>
        </TouchableOpacity>

        {exportState !== 'hidden' && (
          <View style={local.exportPanel}>
            <View style={local.exportDateRow}>
              <TouchableOpacity style={local.exportDateBtn} onPress={() => setExportState('picking_from')}>
                <Text style={local.exportDateLabel}>From</Text>
                <Text style={local.exportDateValue}>{format(exportFrom, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
              <Text style={local.exportSep}>→</Text>
              <TouchableOpacity style={local.exportDateBtn} onPress={() => setExportState('picking_to')}>
                <Text style={local.exportDateLabel}>To</Text>
                <Text style={local.exportDateValue}>{format(exportTo, 'MMM d, yyyy')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={local.exportBtn} onPress={handleExport} disabled={exporting}>
              <Text style={local.exportBtnText}>{exporting ? 'Exporting…' : 'Share CSV'}</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}
