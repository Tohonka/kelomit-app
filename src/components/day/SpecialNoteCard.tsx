import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  /** Current day note, or null/empty when none. */
  note: string | null;
  /** Persist the note. Empty string is passed as null (clears it). */
  onSave: (note: string | null) => void;
  /** Edit-mode open/close, so the parent can lift the card above the keyboard
   *  while writing (the card is the last item on screen). */
  onBeginEdit?: () => void;
  onEndEdit?: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      borderLeftWidth: 4,
      borderLeftColor: c.accent,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    noteText: {fontSize: typography.sizes.base, color: c.textPrimary, lineHeight: 21},
    input: {
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 44,
      paddingTop: spacing.xs,
      textAlignVertical: 'top',
    },
    actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.xs},
    actionText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    addBtn: {
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    addText: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
  });

/** Per-day free-text note (sick day, office closed early, …). Rendered as the
 *  last section of the Day screen so adding/removing it never shifts the entry
 *  list. Inline edit — no modal — to keep friction low. */
export default function SpecialNoteCard({note, onSave, onBeginEdit, onEndEdit}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  const beginEdit = () => {
    setDraft(note ?? '');
    setEditing(true);
    onBeginEdit?.();
  };

  const stopEditing = () => {
    setEditing(false);
    onEndEdit?.();
  };

  const commit = () => {
    const trimmed = draft.trim();
    onSave(trimmed.length > 0 ? trimmed : null);
    stopEditing();
  };

  if (editing) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{t('dayNote.title')}</Text>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t('dayNote.placeholder')}
          placeholderTextColor={colors.textMuted}
          autoFocus
          maxLength={280}
          returnKeyType="done"
          onSubmitEditing={commit}
        />
        <View style={styles.actions}>
          <TouchableOpacity onPress={stopEditing}>
            <Text style={[styles.actionText, {color: colors.textMuted}]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={commit}>
            <Text style={[styles.actionText, {color: colors.primary}]}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (note && note.trim().length > 0) {
    return (
      <TouchableOpacity style={styles.card} onPress={beginEdit} activeOpacity={0.7}>
        <Text style={styles.label}>{t('dayNote.title')}</Text>
        <Text style={styles.noteText}>{note}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.addBtn} onPress={beginEdit} activeOpacity={0.7}>
      <Text style={styles.addText}>{t('dayNote.add')}</Text>
    </TouchableOpacity>
  );
}
