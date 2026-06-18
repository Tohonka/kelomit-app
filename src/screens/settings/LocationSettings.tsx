import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {useLocationStore} from '../../store/locationStore';
import {MIN_RADIUS_M} from '../../db/locations';
import {getCurrentPositionOnce, getLastPositionError} from '../../services/gpsService';

const RADIUS_STEP_M = 25;
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {LocationKind} from '../../types';
import {makeSettingsStyles} from './settingsStyles';

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    hint: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      lineHeight: 16,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    locItem: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    locTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    locName: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
    locMeta: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    deleteText: {color: c.error, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    radiusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm},
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: {opacity: 0.4},
    stepBtnText: {fontSize: 22, lineHeight: 26, color: c.textPrimary, fontWeight: typography.weights.semibold},
    radiusValue: {fontSize: typography.sizes.sm, color: c.textSecondary, minWidth: 88, textAlign: 'center'},
    addRow: {flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md},
    addBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: c.primary + '12',
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    addBtnText: {color: c.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    addBtnDisabled: {opacity: 0.5},
    empty: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.textMuted, fontSize: typography.sizes.sm},
  });

export default function LocationSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const {locations, loaded, load, add, remove, setRadius} = useLocationStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);

  const saveCurrent = async (kind: LocationKind) => {
    setSaving(true);
    try {
      const pos = await getCurrentPositionOnce();
      if (!pos) {
        const detail = getLastPositionError();
        Alert.alert(
          t('location.title'),
          detail ? `${t('location.noPosition')}\n\n${detail}` : t('location.noPosition'),
        );
        return;
      }
      await add({
        name: kind === 'work' ? t('location.work') : t('location.home'),
        kind,
        latitude: pos.latitude,
        longitude: pos.longitude,
        radius_m: 150,
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (id: number, name: string) => {
    Alert.alert(t('location.deleteTitle'), t('location.deleteMessage', {name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => remove(id)},
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('location.savedLocations')}</Text>
        {locations.length === 0 ? (
          <Text style={local.empty}>{t('location.noLocations')}</Text>
        ) : (
          locations.map(loc => {
            const atFloor = loc.radius_m <= MIN_RADIUS_M;
            return (
              <View key={loc.id} style={local.locItem}>
                <View style={local.locTopRow}>
                  <Text style={local.locName}>
                    {loc.name} · {loc.kind === 'work' ? t('location.work') : loc.kind === 'home' ? t('location.home') : loc.kind}
                  </Text>
                  <TouchableOpacity onPress={() => confirmDelete(loc.id, loc.name)}>
                    <Text style={local.deleteText}>{t('common.delete')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={local.locMeta}>
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </Text>
                <View style={local.radiusRow}>
                  <TouchableOpacity
                    style={[local.stepBtn, atFloor && local.stepBtnDisabled]}
                    disabled={atFloor}
                    accessibilityRole="button"
                    accessibilityLabel={t('location.decreaseRadius')}
                    onPress={() => setRadius(loc.id, loc.radius_m - RADIUS_STEP_M)}>
                    <Text style={local.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={local.radiusValue}>{t('location.radius', {m: loc.radius_m})}</Text>
                  <TouchableOpacity
                    style={local.stepBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('location.increaseRadius')}
                    onPress={() => setRadius(loc.id, loc.radius_m + RADIUS_STEP_M)}>
                    <Text style={local.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        {locations.length > 0 && (
          <Text style={local.hint}>{t('location.radiusFloorHint')}</Text>
        )}

        <Text style={styles.sectionHeader}>{t('location.addCurrent')}</Text>
        <View style={local.addRow}>
          <TouchableOpacity
            style={[local.addBtn, saving && local.addBtnDisabled]}
            disabled={saving}
            onPress={() => saveCurrent('work')}>
            <Text style={local.addBtnText}>{t('location.atWorkNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[local.addBtn, saving && local.addBtnDisabled]}
            disabled={saving}
            onPress={() => saveCurrent('home')}>
            <Text style={local.addBtnText}>{t('location.atHomeNow')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={local.hint}>{t('location.autoStampHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
