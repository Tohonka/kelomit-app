import React, {useMemo} from 'react';
import {Modal, Text, StyleSheet, Pressable} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
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
      maxHeight: '80%',
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
  });

/** Bottom-anchored modal card. Backdrop tap and the back button close it;
 *  taps inside the card don't propagate to the backdrop. */
export default function Sheet({visible, title, onClose, children}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
