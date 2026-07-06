import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import {getApiKey, setApiKey, clearApiKey} from '../../services/transcription/keychain';
import {getSetting, setSetting} from '../../db/settings';
import {selectProvider, type Provider} from '../../services/transcription/selectProvider';
import {getModelState, downloadModel, deleteModel} from '../../services/transcription/modelManager';

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    block: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.border},
    label: {fontSize: typography.sizes.base, color: c.textPrimary, marginBottom: spacing.sm},
    status: {fontSize: typography.sizes.xs, color: c.textMuted, marginBottom: spacing.md},
    input: {
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    actions: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.md},
    engineRow: {flexDirection: 'row', gap: spacing.sm},
    btn: {flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', backgroundColor: c.primary},
    btnText: {color: '#fff', fontWeight: typography.weights.semibold, fontSize: typography.sizes.base},
    btnClear: {backgroundColor: c.bgMuted, borderWidth: 1, borderColor: c.border},
    btnClearText: {color: c.error},
  });

export default function TranscriptionSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const [hasKey, setHasKey] = useState(false);
  const [draft, setDraft] = useState('');
  const [provider, setProvider] = useState<Provider>('ondevice');
  const [modelState, setModelState] = useState<'missing' | 'ready'>('missing');
  const [dlPct, setDlPct] = useState<number | null>(null);

  useEffect(() => {
    getApiKey().then(k => setHasKey(!!k));
    getSetting('transcription_provider').then(v => setProvider(selectProvider(v)));
    getModelState().then(setModelState);
  }, []);

  const pickProvider = async (p: Provider) => {
    setProvider(p);
    await setSetting('transcription_provider', p);
  };

  const runDownload = async () => {
    setDlPct(0);
    try {
      await downloadModel(setDlPct);
      setModelState('ready');
    } catch {
      Alert.alert(t('transcription.downloadFailed'));
    } finally {
      setDlPct(null);
    }
  };

  const runDelete = async () => {
    await deleteModel();
    setModelState('missing');
  };

  const save = async () => {
    const key = draft.trim();
    if (!key) { return; }
    await setApiKey(key);
    setDraft('');
    setHasKey(true);
    Alert.alert(t('transcription.saved'));
  };

  const clear = async () => {
    await clearApiKey();
    setHasKey(false);
    Alert.alert(t('transcription.cleared'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('transcription.engineTitle')}</Text>
        <View style={local.block}>
          <View style={local.engineRow}>
            {(['ondevice', 'api'] as Provider[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[local.btn, provider !== p && local.btnClear]}
                onPress={() => pickProvider(p)}>
                <Text style={[local.btnText, provider !== p && local.btnClearText]}>
                  {p === 'ondevice' ? t('transcription.engineOnDevice') : t('transcription.engineApi')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {provider === 'ondevice' && (
          <>
            <Text style={styles.sectionHeader}>{t('transcription.modelTitle')}</Text>
            <View style={local.block}>
              <Text style={local.status}>
                {dlPct != null
                  ? t('transcription.modelDownloading', {pct: dlPct})
                  : modelState === 'ready'
                  ? t('transcription.modelReady')
                  : t('transcription.modelNotDownloaded')}
              </Text>
              <View style={local.actions}>
                {modelState === 'missing' && dlPct == null && (
                  <TouchableOpacity style={local.btn} onPress={runDownload}>
                    <Text style={local.btnText}>{t('transcription.download')}</Text>
                  </TouchableOpacity>
                )}
                {modelState === 'ready' && (
                  <TouchableOpacity style={[local.btn, local.btnClear]} onPress={runDelete}>
                    <Text style={[local.btnText, local.btnClearText]}>{t('transcription.delete')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionHeader}>{t('transcription.provider')}</Text>
        <View style={local.block}>
          <Text style={local.label}>{t('transcription.keyLabel')}</Text>
          <Text style={local.status}>{hasKey ? t('transcription.keySet') : t('transcription.keyNotSet')}</Text>
          <TextInput
            style={local.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('transcription.keyPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={local.actions}>
            <TouchableOpacity style={local.btn} onPress={save}>
              <Text style={local.btnText}>{t('transcription.save')}</Text>
            </TouchableOpacity>
            {hasKey && (
              <TouchableOpacity style={[local.btn, local.btnClear]} onPress={clear}>
                <Text style={[local.btnText, local.btnClearText]}>{t('transcription.clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
