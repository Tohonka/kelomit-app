import React, {useMemo, useRef, useState, useEffect} from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  visible: boolean;
  initialHours: number;
  initialMinutes: number;
  onConfirm: (hours: number, minutes: number) => void;
  onCancel: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#00000088',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.lg,
    },
    title: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
      textAlign: 'center',
    },
    fields: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
    field: {
      width: 72,
      height: 64,
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      textAlign: 'center',
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
    },
    fieldFocused: {borderColor: c.primary},
    colon: {fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: c.textMuted},
    hint: {fontSize: typography.sizes.xs, color: c.textMuted, textAlign: 'center'},
    actions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs},
    btn: {flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center'},
    cancelBtn: {backgroundColor: c.bgMuted},
    cancelText: {color: c.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.base},
    okBtn: {backgroundColor: c.primary},
    okText: {color: c.white, fontWeight: typography.weights.semibold, fontSize: typography.sizes.base},
    okBtnDisabled: {opacity: 0.4},
  });

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export default function TypedTimeModal({
  visible,
  initialHours,
  initialMinutes,
  onConfirm,
  onCancel,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const minuteRef = useRef<TextInput>(null);

  const [hh, setHh] = useState(pad(initialHours));
  const [mm, setMm] = useState(pad(initialMinutes));
  const [focused, setFocused] = useState<'hh' | 'mm' | null>(null);

  // Reset fields each time the modal opens
  useEffect(() => {
    if (visible) {
      setHh(pad(initialHours));
      setMm(pad(initialMinutes));
    }
  }, [visible, initialHours, initialMinutes]);

  const hNum = parseInt(hh, 10);
  const mNum = parseInt(mm, 10);
  const valid =
    !Number.isNaN(hNum) && !Number.isNaN(mNum) &&
    hNum >= 0 && hNum <= 23 && mNum >= 0 && mNum <= 59;

  const onChangeHh = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHh(digits);
    if (digits.length === 2) { minuteRef.current?.focus(); }
  };

  const onChangeMm = (text: string) => {
    setMm(text.replace(/[^0-9]/g, '').slice(0, 2));
  };

  const confirm = () => {
    if (valid) { onConfirm(hNum, mNum); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Enter time</Text>
          <View style={styles.fields}>
            <TextInput
              style={[styles.field, focused === 'hh' && styles.fieldFocused]}
              value={hh}
              onChangeText={onChangeHh}
              onFocus={() => setFocused('hh')}
              onBlur={() => setFocused(null)}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              autoFocus
              placeholder="HH"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              ref={minuteRef}
              style={[styles.field, focused === 'mm' && styles.fieldFocused]}
              value={mm}
              onChangeText={onChangeMm}
              onFocus={() => setFocused('mm')}
              onBlur={() => setFocused(null)}
              onSubmitEditing={confirm}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              placeholder="MM"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <Text style={styles.hint}>24-hour format · 00:00 – 23:59</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.okBtn, !valid && styles.okBtnDisabled]}
              onPress={confirm}
              disabled={!valid}>
              <Text style={styles.okText}>OK</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
