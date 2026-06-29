import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal, Text, TouchableOpacity, StyleSheet, Pressable} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

export interface SheetAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end'},
    sheet: {
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    action: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    actionText: {fontSize: typography.sizes.base, color: c.textPrimary, textAlign: 'center'},
    destructive: {color: c.error},
    cancel: {
      marginTop: spacing.sm,
      marginHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
    },
    cancelText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });

export default function ActionSheet({visible, title, actions, onClose}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={styles.action}
              onPress={() => { onClose(); a.onPress(); }}>
              <Text style={[styles.actionText, a.destructive && styles.destructive]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
