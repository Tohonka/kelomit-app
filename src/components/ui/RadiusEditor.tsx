import React, {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';
import {clampRadius, MAX_RADIUS_M, MIN_RADIUS_M} from '../../utils/geofence';

const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 80;

/** ±1 m stepper with press-and-hold auto-repeat and tap-to-type. Clamps to
 *  [MIN_RADIUS_M, MAX_RADIUS_M]; the caller persists via onChange. */
export default function RadiusEditor({
  value,
  onChange,
}: {
  value: number;
  onChange: (radiusM: number) => void;
}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const step = (direction: 1 | -1) => {
    const next = clampRadius(latest.current + direction);
    if (next !== latest.current) {
      onChange(next);
    }
  };
  const startRepeat = (direction: 1 | -1) => {
    step(direction);
    delay.current = setTimeout(() => {
      timer.current = setInterval(() => step(direction), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };
  const stopRepeat = () => {
    if (delay.current) clearTimeout(delay.current);
    if (timer.current) clearInterval(timer.current);
    delay.current = null;
    timer.current = null;
  };
  // Unmount-while-held: onPressOut won't fire if the row disappears mid-press
  // (e.g. the location gets deleted), so the interval/timeout would otherwise
  // outlive the component and keep firing onChange against a stale closure.
  useEffect(() => stopRepeat, []);

  const commitDraft = () => {
    setEditing(false);
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      onChange(clampRadius(parsed));
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.stepBtn, value <= MIN_RADIUS_M && styles.stepBtnDisabled]}
        disabled={value <= MIN_RADIUS_M}
        accessibilityRole="button"
        accessibilityLabel={t('location.decreaseRadius')}
        onPressIn={() => startRepeat(-1)}
        onPressOut={stopRepeat}>
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      {editing ? (
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          keyboardType="number-pad"
          autoFocus
          maxLength={4}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          testID="radius-input"
        />
      ) : (
        <TouchableOpacity
          onPress={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('location.editRadius')}>
          <Text style={styles.value}>{t('location.radius', {m: value})}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.stepBtn, value >= MAX_RADIUS_M && styles.stepBtnDisabled]}
        disabled={value >= MAX_RADIUS_M}
        accessibilityRole="button"
        accessibilityLabel={t('location.increaseRadius')}
        onPressIn={() => startRepeat(1)}
        onPressOut={stopRepeat}>
        <Text style={styles.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm},
    stepBtn: {
      width: 36, height: 36, borderRadius: radius.md, borderWidth: 1,
      borderColor: c.border, backgroundColor: c.bgMuted,
      alignItems: 'center', justifyContent: 'center',
    },
    stepBtnDisabled: {opacity: 0.4},
    stepBtnText: {color: c.textPrimary, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold},
    value: {color: c.textPrimary, fontSize: typography.sizes.base, textDecorationLine: 'underline'},
    input: {
      color: c.textPrimary, fontSize: typography.sizes.base, minWidth: 64,
      borderBottomWidth: 1, borderBottomColor: c.primary, padding: 0, textAlign: 'center',
    },
  });
