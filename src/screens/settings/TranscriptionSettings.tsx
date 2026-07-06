import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import {getApiKey, setApiKey, clearApiKey} from '../../services/transcription/keychain';

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

  useEffect(() => {
    getApiKey().then(k => setHasKey(!!k));
  }, []);

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
