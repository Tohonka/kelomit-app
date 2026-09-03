import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {subDays, format} from 'date-fns';
import {exportToCsv} from '../../utils/exportUtils';
import {exportBackup, importBackup} from '../../services/backupService';
import {runSync} from '../../services/syncService';
import {getSyncConfig, setSyncConfig, getSyncStatus} from '../../services/syncSettings';
import {useTheme, typography, spacing, radius} from '../../theme';
import {getDateFnsLocale} from '../../i18n';
import {useSettingsStore} from '../../store/settingsStore';
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
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    exportBtnText: {
      color: c.white,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
    syncInput: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      color: c.textPrimary,
      fontSize: typography.sizes.base,
    },
    syncStatus: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.sizes.sm,
      color: c.textMuted,
    },
    syncBusyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    syncBusyText: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
    },
  });

export default function DataSettings(_props: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const language = useSettingsStore(s => s.language);
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const [exportFrom, setExportFrom] = useState<Date>(() => subDays(new Date(), 29));
  const [exportTo, setExportTo] = useState<Date>(new Date());
  const [exportState, setExportState] = useState<ExportState>('hidden');
  const [exporting, setExporting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [syncUrl, setSyncUrl] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');

  const refreshSyncStatus = async () => {
    const {lastAt, lastError} = await getSyncStatus();
    if (lastError) {
      setSyncStatusText(t('settings.syncFailed', {error: lastError}));
    } else if (lastAt) {
      setSyncStatusText(
        t('settings.syncLastAt', {
          when: format(new Date(lastAt), 'd.M.yyyy HH:mm', {
            locale: getDateFnsLocale(language),
          }),
        }),
      );
    } else {
      setSyncStatusText(t('settings.syncNeverRun'));
    }
  };

  useEffect(() => {
    (async () => {
      const config = await getSyncConfig();
      if (config) {
        setSyncUrl(config.url);
        setSyncToken(config.token);
      }
      await refreshSyncStatus();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSync = async () => {
    await setSyncConfig(syncUrl, syncToken);
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    try {
      await handleSaveSync();
      const result = await runSync();
      if (result === 'not_configured') {
        Alert.alert(t('settings.syncSection'), t('settings.syncNotConfigured'));
      } else if (result === 'done') {
        Alert.alert(t('settings.syncSection'), t('settings.syncDone'));
      }
      await refreshSyncStatus();
    } finally {
      setSyncBusy(false);
    }
  };

  const handleBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await exportBackup();
      if (result === 'done') {
        Alert.alert(t('settings.backupSavedTitle'), t('settings.backupSavedMessage'));
      }
    } catch (e) {
      Alert.alert(t('settings.backupFailed'), String(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(t('settings.restoreConfirmTitle'), t('settings.restoreConfirmMessage'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('settings.restoreConfirmCta'),
        style: 'destructive',
        onPress: async () => {
          setBackupBusy(true);
          try {
            const result = await importBackup();
            if (result === 'done') {
              Alert.alert(t('settings.restoreDoneTitle'), t('settings.restoreDoneMessage'));
            }
          } catch (e) {
            Alert.alert(t('settings.restoreFailed'), String(e));
          } finally {
            setBackupBusy(false);
          }
        },
      },
    ]);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportToCsv(
        format(exportFrom, 'yyyy-MM-dd'),
        format(exportTo, 'yyyy-MM-dd'),
      );
      if (result === 'done') {
        ToastAndroid.show(t('settings.exportDone'), ToastAndroid.SHORT);
      }
    } catch (e) {
      Alert.alert(t('settings.exportFailed'), String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('common.data')}</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => setExportState(s => (s === 'hidden' ? 'ready' : 'hidden'))}>
          <Text style={styles.rowLabel}>{t('settings.exportCsv')}</Text>
          <Text style={styles.rowCaret}>{exportState !== 'hidden' ? '↓' : '›'}</Text>
        </TouchableOpacity>

        {exportState !== 'hidden' && (
          <View style={local.exportPanel}>
            <View style={local.exportDateRow}>
              <TouchableOpacity style={local.exportDateBtn} onPress={() => setExportState('picking_from')}>
                <Text style={local.exportDateLabel}>{t('common.from')}</Text>
                <Text style={local.exportDateValue}>
                  {format(exportFrom, 'MMM d, yyyy', {locale: getDateFnsLocale(language)})}
                </Text>
              </TouchableOpacity>
              <Text style={local.exportSep}>→</Text>
              <TouchableOpacity style={local.exportDateBtn} onPress={() => setExportState('picking_to')}>
                <Text style={local.exportDateLabel}>{t('common.to')}</Text>
                <Text style={local.exportDateValue}>
                  {format(exportTo, 'MMM d, yyyy', {locale: getDateFnsLocale(language)})}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={local.exportBtn} onPress={handleExport} disabled={exporting}>
              {exporting && <ActivityIndicator size="small" color={colors.white} />}
              <Text style={local.exportBtnText}>
                {exporting ? t('settings.exporting') : t('settings.shareCsv')}
              </Text>
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

        <Text style={styles.sectionHeader}>{t('settings.backupSection')}</Text>

        <TouchableOpacity style={styles.row} onPress={handleBackup} disabled={backupBusy}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.backup')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.backupSubtitle')}</Text>
          </View>
          {backupBusy
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.rowCaret}>›</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={handleRestore} disabled={backupBusy}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.restore')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.restoreSubtitle')}</Text>
          </View>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t('settings.syncSection')}</Text>

        <TextInput
          style={local.syncInput}
          value={syncUrl}
          onChangeText={setSyncUrl}
          onBlur={handleSaveSync}
          placeholder={t('settings.syncServerUrl')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TextInput
          style={local.syncInput}
          value={syncToken}
          onChangeText={setSyncToken}
          onBlur={handleSaveSync}
          placeholder={t('settings.syncToken')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {syncBusy ? (
          // Live feedback instead of the stale last-result line: a sync can
          // take a while (media uploads), and "failed" lingering on screen
          // during a retry reads as if nothing is happening.
          <View style={local.syncBusyRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={local.syncBusyText}>{t('settings.syncing')}</Text>
          </View>
        ) : (
          <Text style={local.syncStatus}>{syncStatusText}</Text>
        )}

        <TouchableOpacity style={styles.row} onPress={handleSyncNow} disabled={syncBusy}>
          <Text style={styles.rowLabel}>
            {syncBusy ? t('settings.syncing') : t('settings.syncNow')}
          </Text>
          {syncBusy
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.rowCaret}>›</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
