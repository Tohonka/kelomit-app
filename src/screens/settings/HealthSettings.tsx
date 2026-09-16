import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
  ToastAndroid,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format} from 'date-fns';
import {useSettingsStore, type Sex} from '../../store/settingsStore';
import {getHealthDaily} from '../../db/health';
import {
  connectHealth,
  getHealthStatus,
  getLastImportAt,
  maybeImportHealth,
  openHealthSettings,
  type HealthStatus,
} from '../../services/healthConnect';
import {todayDate} from '../../utils/dateUtils';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {RootStackScreenProps} from '../../navigation/navigationTypes';
import type {HealthDaily} from '../../types';
import {makeSettingsStyles} from './settingsStyles';

type Props = RootStackScreenProps<'HealthSettings'>;

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    status: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
    },
    hint: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      fontSize: typography.sizes.xs,
      color: c.textMuted,
    },
    input: {
      width: 96,
      minHeight: 40,
      paddingHorizontal: spacing.md,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      textAlign: 'right',
    },
  });

function numOrNull(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return text.trim() && Number.isFinite(n) ? n : null;
}

export default function HealthSettings(_props: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const {
    health_enabled,
    setHealthEnabled,
    body_weight_kg,
    body_height_cm,
    birth_year,
    sex,
    setBodyProfile,
  } = useSettingsStore();

  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [today, setToday] = useState<HealthDaily | null>(null);
  const [weight, setWeight] = useState(body_weight_kg != null ? String(body_weight_kg) : '');
  const [height, setHeight] = useState(body_height_cm != null ? String(body_height_cm) : '');
  const [year, setYear] = useState(birth_year != null ? String(birth_year) : '');

  // An import can fill the profile behind the inputs (prefillBodyProfile).
  useEffect(() => { setWeight(body_weight_kg != null ? String(body_weight_kg) : ''); }, [body_weight_kg]);
  useEffect(() => { setHeight(body_height_cm != null ? String(body_height_cm) : ''); }, [body_height_cm]);

  const refresh = useCallback(async () => {
    setLastImport(await getLastImportAt());
    setToday(await getHealthDaily(todayDate()));
  }, []);

  useEffect(() => {
    getHealthStatus().then(setStatus);
    refresh().catch(() => {});
  }, [refresh]);

  const runImport = async () => {
    const n = await maybeImportHealth(true);
    ToastAndroid.show(t('health.imported', {n}), ToastAndroid.SHORT);
    await refresh();
  };

  const handleToggle = async () => {
    if (health_enabled) {
      await setHealthEnabled(false);
      return;
    }
    if (status !== 'available') {
      openHealthSettings();
      return;
    }
    setBusy(true);
    try {
      if (!(await connectHealth())) {
        ToastAndroid.show(t('health.permissionsDenied'), ToastAndroid.LONG);
        return;
      }
      await setHealthEnabled(true);
      await runImport();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      await runImport();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const statusText =
    status === 'available'
      ? t('health.statusAvailable')
      : status === 'update_required'
      ? t('health.statusUpdate')
      : status === 'unavailable'
      ? t('health.statusUnavailable')
      : '';

  const todayParts: string[] = [];
  if (today?.steps != null) { todayParts.push(t('health.steps', {n: today.steps})); }
  if (today?.sleep_minutes != null) {
    todayParts.push(t('health.sleep', {h: Math.floor(today.sleep_minutes / 60), m: today.sleep_minutes % 60}));
  }
  if (today?.weight_kg != null) { todayParts.push(t('health.weight', {kg: today.weight_kg.toFixed(1)})); }

  const sexOptions: {value: Sex | null; labelKey: string}[] = [
    {value: null, labelKey: 'health.sexUnset'},
    {value: 'male', labelKey: 'health.sexMale'},
    {value: 'female', labelKey: 'health.sexFemale'},
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionHeader}>Health Connect</Text>
        {!!statusText && <Text style={local.status}>{statusText}</Text>}

        <TouchableOpacity style={styles.row} onPress={handleToggle} disabled={busy}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('health.connect')}</Text>
            <Text style={styles.rowSubLabel}>{t('health.connectDescription')}</Text>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={[styles.toggle, health_enabled && styles.toggleOn]}>
              <Text style={[styles.toggleText, health_enabled && styles.toggleTextOn]}>
                {health_enabled ? t('common.on') : t('common.off')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {health_enabled && (
          <>
            <TouchableOpacity style={styles.row} onPress={handleImport} disabled={busy}>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>{busy ? t('health.importing') : t('health.importNow')}</Text>
                <Text style={styles.rowSubLabel}>
                  {lastImport
                    ? t('health.lastImport', {when: format(new Date(lastImport), 'd.M. HH:mm')})
                    : t('health.neverImported')}
                </Text>
              </View>
              <Text style={styles.rowCaret}>›</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>{t('health.today')}</Text>
                <Text style={styles.rowSubLabel}>
                  {todayParts.length ? todayParts.join(' · ') : t('health.noData')}
                </Text>
              </View>
            </View>
          </>
        )}

        <TouchableOpacity style={styles.row} onPress={openHealthSettings}>
          <Text style={styles.rowLabel}>{t('health.openSettings')}</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t('health.bodySection')}</Text>
        <Text style={local.hint}>{t('health.bodyHint')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('health.weightKg')}</Text>
          <TextInput
            style={local.input}
            value={weight}
            onChangeText={setWeight}
            onBlur={() => setBodyProfile({body_weight_kg: numOrNull(weight)})}
            keyboardType="numeric"
            maxLength={6}
            placeholder="–"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('health.heightCm')}</Text>
          <TextInput
            style={local.input}
            value={height}
            onChangeText={setHeight}
            onBlur={() => setBodyProfile({body_height_cm: numOrNull(height)})}
            keyboardType="numeric"
            maxLength={5}
            placeholder="–"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('health.birthYear')}</Text>
          <TextInput
            style={local.input}
            value={year}
            onChangeText={setYear}
            onBlur={() => setBodyProfile({birth_year: numOrNull(year)})}
            keyboardType="numeric"
            maxLength={4}
            placeholder="–"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('health.sex')}</Text>
          <View style={styles.segment}>
            {sexOptions.map(o => (
              <TouchableOpacity
                key={o.labelKey}
                style={[styles.segmentBtn, sex === o.value && styles.segmentBtnActive]}
                onPress={() => setBodyProfile({sex: o.value})}>
                <Text style={[styles.segmentBtnText, sex === o.value && styles.segmentBtnTextActive]}>
                  {t(o.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
