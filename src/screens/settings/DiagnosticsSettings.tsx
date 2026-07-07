import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {saveDocuments, errorCodes, isErrorWithCode} from '@react-native-documents/picker';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import {diagStats, clearDiag, DIAG_LOG_FILE} from '../../services/diag';

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    block: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.border},
    status: {fontSize: typography.sizes.sm, color: c.textPrimary, marginBottom: spacing.xs},
    hint: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: spacing.sm},
    actions: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.md},
    btn: {flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: c.primary},
    btnText: {color: '#fff', fontWeight: typography.weights.semibold, fontSize: typography.sizes.base},
    btnClear: {backgroundColor: c.bgMuted, borderWidth: 1, borderColor: c.border},
    btnClearText: {color: c.error},
  });

function humanSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DiagnosticsSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const [stats, setStats] = useState<{sizeBytes: number; rows: number} | null>(null);

  const refresh = useCallback(() => {
    diagStats().then(s => setStats({sizeBytes: s.sizeBytes, rows: s.rows}));
  }, []);
  useFocusEffect(refresh);

  const share = async () => {
    if (!stats || stats.sizeBytes === 0) {
      Alert.alert(t('diagnostics.empty'));
      return;
    }
    const fileName = `kelomit-diag-${Date.now()}.log`;
    try {
      await saveDocuments({
        sourceUris: [`file://${DIAG_LOG_FILE}`],
        mimeType: 'text/plain',
        fileName,
        copy: true,
      });
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      Alert.alert(t('diagnostics.shareFailed'));
    }
  };

  const clear = () => {
    Alert.alert(t('diagnostics.clearConfirmTitle'), t('diagnostics.clearConfirmMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('diagnostics.clear'),
        style: 'destructive',
        onPress: async () => {
          await clearDiag();
          refresh();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('diagnostics.logTitle')}</Text>
        <View style={local.block}>
          <Text style={local.status}>
            {t('diagnostics.fileSize', {size: stats ? humanSize(stats.sizeBytes) : '…'})}
          </Text>
          <Text style={local.status}>{t('diagnostics.rowCount', {count: stats?.rows ?? 0})}</Text>
          <Text style={local.hint}>{t('diagnostics.hint')}</Text>
          <View style={local.actions}>
            <TouchableOpacity style={local.btn} onPress={share}>
              <Text style={local.btnText}>{t('diagnostics.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[local.btn, local.btnClear]} onPress={clear}>
              <Text style={[local.btnText, local.btnClearText]}>{t('diagnostics.clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
