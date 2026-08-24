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
    hint: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: spacing.sm},
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
    toggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md},
    toggleLabel: {fontSize: typography.sizes.base, color: c.textPrimary, flex: 1},
    toggleValue: {fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.primary},
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
  const [language, setLanguage] = useState<'auto' | 'fi' | 'en'>('auto');
  const [modelState, setModelState] = useState<'missing' | 'ready'>('missing');
  const [dlPct, setDlPct] = useState<number | null>(null);
  const [cleanup, setCleanup] = useState(false);

  useEffect(() => {
    getApiKey().then(k => setHasKey(!!k));
    getSetting('transcription_provider').then(v => setProvider(selectProvider(v)));
    getSetting('transcription_language').then(v => setLanguage(v === 'fi' || v === 'en' ? v : 'auto'));
    getSetting('transcription_cleanup').then(v => setCleanup(v === 'true'));
    getModelState().then(setModelState);
  }, []);

  const toggleCleanup = async () => {
    const next = !cleanup;
    setCleanup(next);
    await setSetting('transcription_cleanup', String(next));
  };

  const pickProvider = async (p: Provider) => {
    setProvider(p);
    await setSetting('transcription_provider', p);
  };

  const pickLanguage = async (l: 'auto' | 'fi' | 'en') => {
    setLanguage(l);
    await setSetting('transcription_language', l);
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
            <Text style={styles.sectionHeader}>{t('transcription.languageTitle')}</Text>
            <View style={local.block}>
              <View style={local.engineRow}>
                {(['auto', 'fi', 'en'] as const).map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[local.btn, language !== l && local.btnClear]}
                    onPress={() => pickLanguage(l)}>
                    <Text style={[local.btnText, language !== l && local.btnClearText]}>
                      {l === 'auto' ? t('transcription.languageAuto') : l === 'fi' ? t('transcription.languageFi') : t('transcription.languageEn')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={local.hint}>{t('transcription.languageHint')}</Text>
            </View>

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

        <Text style={styles.sectionHeader}>{t('transcription.cleanupTitle')}</Text>
        <View style={local.block}>
          <TouchableOpacity style={local.toggleRow} onPress={toggleCleanup}>
            <Text style={local.toggleLabel}>{t('transcription.cleanupLabel')}</Text>
            <Text style={local.toggleValue}>
              {cleanup ? t('common.on') : t('common.off')}
            </Text>
          </TouchableOpacity>
          <Text style={local.hint}>{t('transcription.cleanupHint')}</Text>
          {cleanup && !hasKey && (
            <Text style={local.hint}>{t('transcription.cleanupNeedsKey')}</Text>
          )}
        </View>

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
