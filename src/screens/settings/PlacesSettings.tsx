import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {useLocationStore} from '../../store/locationStore';
import {
  getNamedPlaces,
  renameNamedPlace,
  deleteNamedPlace,
  updateNamedPlaceRadius,
} from '../../db/routeHistory';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {NamedPlace} from '../../types';
import {makeSettingsStyles} from './settingsStyles';
import RadiusEditor from '../../components/ui/RadiusEditor';

type RowKind = 'saved' | 'reusable';

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
      gap: spacing.md,
    },
    locName: {
      flex: 1,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      fontWeight: typography.weights.medium,
    },
    actionText: {color: c.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    deleteText: {color: c.error, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    nameInput: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
    },
    empty: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.textMuted, fontSize: typography.sizes.sm},
  });

export default function PlacesSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const {locations, load, remove, setRadius, rename} = useLocationStore();
  const [namedPlaces, setNamedPlaces] = useState<NamedPlace[]>([]);
  const [editing, setEditing] = useState<{type: RowKind; id: number} | null>(null);
  const [draft, setDraft] = useState('');
  // Consumed-once token mirroring `editing` (savingRef pattern from
  // PlaceNameSheet): onSubmitEditing and onBlur both fire for a single edit,
  // and the second call sees a stale `editing` from its closure.
  const editingRef = useRef<{type: RowKind; id: number} | null>(null);

  const reloadNamed = useCallback(async () => {
    setNamedPlaces(await getNamedPlaces());
  }, []);

  useEffect(() => {
    load().catch(() => {});
    reloadNamed().catch(() => {});
  }, [load, reloadNamed]);

  const startRename = (type: RowKind, id: number, name: string) => {
    setDraft(name);
    editingRef.current = {type, id};
    setEditing({type, id});
  };

  /** Commits at most one write per edit, and only when the name actually
   *  changed — a blur after an unchanged edit would otherwise cost a DB write
   *  plus (for saved places) a full native geofence re-sync. */
  const commitRename = async (current: string) => {
    const target = editingRef.current;
    if (!target) { return; }
    editingRef.current = null;
    setEditing(null);
    const name = draft.trim();
    if (!name || name === current) { return; }
    if (target.type === 'saved') {
      await rename(target.id, name);
    } else {
      await renameNamedPlace(target.id, name);
      await reloadNamed();
    }
  };

  const confirmDelete = (type: RowKind, id: number, name: string) => {
    Alert.alert(t('places.deleteTitle'), t('places.deleteMessage', {name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          type === 'saved'
            ? remove(id)
            : deleteNamedPlace(id).then(reloadNamed),
      },
    ]);
  };

  const row = (type: RowKind, place: {id: number; name: string; radius_m: number}) => (
    <View key={`${type}-${place.id}`} style={local.locItem}>
      <View style={local.locTopRow}>
        {editing?.type === type && editing.id === place.id ? (
          <TextInput
            style={local.nameInput}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            maxLength={60}
            onBlur={() => commitRename(place.name)}
            onSubmitEditing={() => commitRename(place.name)}
          />
        ) : (
          <>
            <Text style={local.locName}>{place.name}</Text>
            <TouchableOpacity
              testID={`rename-${type}-${place.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('places.rename')}
              onPress={() => startRename(type, place.id, place.name)}>
              <Text style={local.actionText}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`delete-${type}-${place.id}`}
              accessibilityRole="button"
              onPress={() => confirmDelete(type, place.id, place.name)}>
              <Text style={local.deleteText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <RadiusEditor
        value={place.radius_m}
        onChange={m => {
          if (type === 'saved') {
            setRadius(place.id, m);
          } else {
            updateNamedPlaceRadius(place.id, m).then(reloadNamed);
          }
        }}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('places.savedSection')}</Text>
        {locations.length === 0 ? (
          <Text style={local.empty}>{t('places.empty')}</Text>
        ) : (
          locations.map(loc => row('saved', loc))
        )}

        <Text style={styles.sectionHeader}>{t('places.reusableSection')}</Text>
        {namedPlaces.length === 0 ? (
          <Text style={local.empty}>{t('places.empty')}</Text>
        ) : (
          namedPlaces.map(place => row('reusable', place))
        )}
        <Text style={local.hint}>{t('places.renameHint')}</Text>
        <Text style={local.hint}>{t('location.radiusFloorHint')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
