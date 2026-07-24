import React, {useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';
import type {PlaceCandidate} from '../../services/placesService';

export type LocalPlaceChoice = {
  type: 'saved' | 'reusable';
  id: number;
  name: string;
  distanceM: number;
};

export type PlaceNameChoice =
  | LocalPlaceChoice
  | (PlaceCandidate & {type: 'google'});

interface Props {
  visible: boolean;
  currentName: string | null;
  localChoices: LocalPlaceChoice[];
  googleCandidates: PlaceCandidate[];
  googleLoading: boolean;
  googleError: boolean;
  onChoose: (choice: PlaceNameChoice) => Promise<void>;
  onCreateName: (name: string) => Promise<void>;
  onClose: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#00000088',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '80%',
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    heading: {
      color: c.textPrimary,
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      paddingHorizontal: spacing.lg,
    },
    currentName: {
      color: c.textSecondary,
      fontSize: typography.sizes.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    row: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowName: {
      color: c.textPrimary,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
    rowMeta: {
      color: c.textMuted,
      fontSize: typography.sizes.sm,
      marginTop: spacing.xs,
    },
    status: {
      color: c.textMuted,
      fontSize: typography.sizes.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    input: {
      color: c.textPrimary,
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      fontSize: typography.sizes.base,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    action: {
      flex: 1,
      alignItems: 'center',
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      backgroundColor: c.bgMuted,
    },
    save: {backgroundColor: c.primary},
    disabled: {opacity: 0.45},
    actionText: {
      color: c.textSecondary,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
    },
    saveText: {color: c.white},
  });

export default function PlaceNameSheet({
  visible,
  currentName,
  localChoices,
  googleCandidates,
  googleLoading,
  googleError,
  onChoose,
  onCreateName,
  onClose,
}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const openToken = useRef(0);
  const trimmedName = name.trim();

  useEffect(() => {
    openToken.current += 1;
    savingRef.current = false;
    setIsSaving(false);
    setSaveError(false);
    if (!visible) {
      setIsNaming(false);
      setName('');
    }
  }, [visible]);

  const typeLabel = (type: PlaceNameChoice['type']) =>
    t(
      type === 'saved'
        ? 'map.savedPlace'
        : type === 'reusable'
          ? 'map.reusablePlace'
          : 'map.googlePlace',
    );
  const distanceLabel = (distanceM: number) =>
    t('map.distanceAway', {distance: `${Math.round(distanceM)} m`});
  const save = async (operation: () => Promise<void>) => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    const token = openToken.current;
    setIsSaving(true);
    setSaveError(false);
    try {
      await operation();
      if (openToken.current === token) {
        onClose();
      }
    } catch {
      if (openToken.current === token) {
        setSaveError(true);
      }
    } finally {
      if (openToken.current === token) {
        savingRef.current = false;
        setIsSaving(false);
      }
    }
  };
  const createName = async () => {
    if (!trimmedName) {
      return;
    }
    await save(() => onCreateName(trimmedName));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isSaving ? () => {} : onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={isSaving ? undefined : onClose}
        />
        <View style={styles.sheet}>
          <Text style={styles.heading}>{t('map.choosePlace')}</Text>
          {currentName ? (
            <Text style={styles.currentName}>{currentName}</Text>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            {localChoices.map(choice => {
              const type = typeLabel(choice.type);
              const distance = distanceLabel(choice.distanceM);
              return (
                <TouchableOpacity
                  key={`${choice.type}-${choice.id}`}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('map.choosePlace')} ${choice.name}, ${type}, ${distance}`}
                  accessibilityState={{disabled: isSaving}}
                  disabled={isSaving}
                  onPress={() => {
                    save(() => onChoose(choice));
                  }}>
                  <Text style={styles.rowName}>{choice.name}</Text>
                  <Text style={styles.rowMeta}>
                    {type} · {distance}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {googleCandidates.map(candidate => {
              const choice: PlaceNameChoice = {...candidate, type: 'google'};
              const type = typeLabel(choice.type);
              const distance = distanceLabel(choice.distanceM);
              return (
                <TouchableOpacity
                  key={choice.placeId}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('map.choosePlace')} ${choice.name}, ${type}, ${distance}`}
                  accessibilityState={{disabled: isSaving}}
                  disabled={isSaving}
                  onPress={() => {
                    save(() => onChoose(choice));
                  }}>
                  <Text style={styles.rowName}>{choice.name}</Text>
                  <Text style={styles.rowMeta}>
                    {type} · {distance}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {googleLoading ? (
              <Text style={styles.status}>{t('map.placesLoading')}</Text>
            ) : googleError ? (
              <Text style={styles.status}>{t('map.placesError')}</Text>
            ) : googleCandidates.length === 0 ? (
              <Text style={styles.status}>{t('map.unknown')}</Text>
            ) : null}
            {saveError ? (
              <Text
                style={styles.status}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite">
                {t('map.placeSaveError')}
              </Text>
            ) : null}
            {isNaming ? (
              <>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('map.placeName')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={t('map.placeName')}
                  autoFocus
                />
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.action}
                    accessibilityRole="button"
                    accessibilityLabel={t('map.cancel')}
                    accessibilityState={{disabled: isSaving}}
                    disabled={isSaving}
                    onPress={() => {
                      setIsNaming(false);
                      setName('');
                    }}>
                    <Text style={styles.actionText}>{t('map.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.action,
                      styles.save,
                      (!trimmedName || isSaving) && styles.disabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t('map.save')}
                    accessibilityState={{disabled: !trimmedName || isSaving}}
                    disabled={!trimmedName || isSaving}
                    onPress={createName}>
                    <Text style={[styles.actionText, styles.saveText]}>
                      {t('map.save')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.nameThisPlace')}
                  accessibilityState={{disabled: isSaving}}
                  disabled={isSaving}
                  onPress={() => setIsNaming(true)}>
                  <Text style={styles.rowName}>{t('map.nameThisPlace')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.action}
                  accessibilityRole="button"
                  accessibilityLabel={t('map.cancel')}
                  accessibilityState={{disabled: isSaving}}
                  disabled={isSaving}
                  onPress={onClose}>
                  <Text style={styles.actionText}>{t('map.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
