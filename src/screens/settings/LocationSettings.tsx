import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {useLocationStore} from '../../store/locationStore';
import {MIN_RADIUS_M, radiusStep} from '../../db/locations';
import {getCurrentPositionOnce, getLastPositionError} from '../../services/gpsService';
import type {KnownPosition} from '../../services/gpsService';
import {distanceMeters} from '../../services/locationUtils';
import {getSetting, setSetting} from '../../db/settings';
import {PLACES_API_KEY_SETTING} from '../../services/placesService';

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
    formWrap: {paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm},
    nameInput: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
    },
    kindRow: {flexDirection: 'row', gap: spacing.sm},
    kindChip: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
    },
    kindChipActive: {borderColor: c.primary, backgroundColor: c.primary + '18'},
    kindChipText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    kindChipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
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
    statusText: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
    },
    statusPlace: {color: c.textPrimary, fontWeight: typography.weights.semibold},
  });

export default function LocationSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const {locations, loaded, load, add, remove, setRadius} = useLocationStore();
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkPos, setCheckPos] = useState<KnownPosition | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<LocationKind>('work');
  const [placesKey, setPlacesKey] = useState('');

  useEffect(() => {
    getSetting(PLACES_API_KEY_SETTING).then(v => setPlacesKey(v ?? '')).catch(() => {});
  }, []);

  const kindLabel = (k: LocationKind) =>
    k === 'work' ? t('location.work') : k === 'home' ? t('location.home') : t('location.placeOther');

  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);

  // "Where am I now": forced one-shot read, then match against saved places.
  const checkNow = async () => {
    setChecking(true);
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
      setCheckPos(pos);
    } finally {
      setChecking(false);
    }
  };

  // Nearest saved place whose radius contains the checked position, if any.
  const matchedPlace = useMemo(() => {
    if (!checkPos) { return null; }
    let best: {loc: (typeof locations)[number]; dist: number} | null = null;
    for (const loc of locations) {
      const dist = distanceMeters(checkPos.latitude, checkPos.longitude, loc.latitude, loc.longitude);
      if (dist <= loc.radius_m && (!best || dist < best.dist)) {
        best = {loc, dist};
      }
    }
    return best?.loc ?? null;
  }, [checkPos, locations]);

  const saveHere = async () => {
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
        name: newName.trim() || kindLabel(newKind),
        kind: newKind,
        latitude: pos.latitude,
        longitude: pos.longitude,
        radius_m: 150,
      });
      setNewName('');
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
                    {loc.name} · {kindLabel(loc.kind)}
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
                    onPress={() => setRadius(loc.id, loc.radius_m - radiusStep(loc.radius_m))}>
                    <Text style={local.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={local.radiusValue}>{t('location.radius', {m: loc.radius_m})}</Text>
                  <TouchableOpacity
                    style={local.stepBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('location.increaseRadius')}
                    onPress={() => setRadius(loc.id, loc.radius_m + radiusStep(loc.radius_m))}>
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
        <View style={local.formWrap}>
          <TextInput
            style={local.nameInput}
            value={newName}
            onChangeText={setNewName}
            placeholder={t('location.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={60}
          />
          <View style={local.kindRow}>
            {(['home', 'work', 'other'] as LocationKind[]).map(k => (
              <TouchableOpacity
                key={k}
                style={[local.kindChip, newKind === k && local.kindChipActive]}
                onPress={() => setNewKind(k)}>
                <Text style={[local.kindChipText, newKind === k && local.kindChipTextActive]}>
                  {kindLabel(k)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={local.addRow}>
          <TouchableOpacity
            style={[local.addBtn, saving && local.addBtnDisabled]}
            disabled={saving}
            onPress={saveHere}>
            <Text style={local.addBtnText}>
              {saving ? t('location.checking') : t('location.saveHere')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={local.hint}>{t('location.autoStampHint')}</Text>

        <Text style={styles.sectionHeader}>{t('location.whereAmI')}</Text>
        {checkPos && (
          <Text style={local.statusText}>
            {checkPos.latitude.toFixed(4)}, {checkPos.longitude.toFixed(4)}
            {checkPos.accuracy != null && ` · ${t('location.accuracy', {m: Math.round(checkPos.accuracy)})}`}
            {'\n'}
            <Text style={local.statusPlace}>
              {matchedPlace ? t('location.detected', {place: matchedPlace.name}) : t('location.noPlaceMatch')}
            </Text>
          </Text>
        )}
        <View style={local.addRow}>
          <TouchableOpacity
            style={[local.addBtn, checking && local.addBtnDisabled]}
            disabled={checking}
            onPress={checkNow}>
            <Text style={local.addBtnText}>
              {checking ? t('location.checking') : t('location.checkPosition')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={local.hint}>{t('location.whereAmIHint')}</Text>

        <Text style={styles.sectionHeader}>{t('location.placesKey')}</Text>
        <View style={local.formWrap}>
          <TextInput
            style={local.nameInput}
            value={placesKey}
            onChangeText={setPlacesKey}
            onEndEditing={() => setSetting(PLACES_API_KEY_SETTING, placesKey.trim())}
            placeholder={t('location.placesKeyPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={local.hint}>{t('location.placesKeyHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
