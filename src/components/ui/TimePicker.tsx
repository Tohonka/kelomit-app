import React, {useMemo, useState} from 'react';
import {TouchableOpacity, Text, StyleSheet, Platform} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {formatTime} from '../../utils/dateUtils';
import {useSettingsStore} from '../../store/settingsStore';
import TypedTimeModal from './TypedTimeModal';

interface Props {
  value: string | null;
  baseDate?: string;
  placeholder?: string;
  onChange: (isoString: string) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 72,
    },
    value: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    placeholder: {
      fontSize: typography.sizes.md,
      color: c.textMuted,
    },
  });

function dateFromLocalDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function pickerDate(value: string | null, baseDate?: string): Date {
  if (value) {
    return new Date(value);
  }
  return baseDate ? dateFromLocalDay(baseDate) : new Date();
}

function applyTime(targetDate: Date, hours: number, minutes: number): string {
  const next = new Date(targetDate);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

export default function TimePicker({value, baseDate, placeholder = '–:––', onChange}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mode = useSettingsStore(s => s.time_selector_mode);
  const [showClock, setShowClock] = useState(false);
  const [showTyped, setShowTyped] = useState(false);
  const date = pickerDate(value, baseDate);

  const open = () => {
    if (mode === 'keyboard') { setShowTyped(true); } else { setShowClock(true); }
  };

  return (
    <>
      <TouchableOpacity style={styles.btn} onPress={open} activeOpacity={0.7}>
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatTime(value) : placeholder}
        </Text>
      </TouchableOpacity>

      {showClock && (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display={Platform.OS === 'android' ? 'clock' : 'spinner'}
          onChange={(_event, selected) => {
            setShowClock(false);
            if (selected) {
              onChange(applyTime(date, selected.getHours(), selected.getMinutes()));
            }
          }}
        />
      )}

      <TypedTimeModal
        visible={showTyped}
        initialHours={date.getHours()}
        initialMinutes={date.getMinutes()}
        onCancel={() => setShowTyped(false)}
        onConfirm={(h, m) => {
          setShowTyped(false);
          onChange(applyTime(date, h, m));
        }}
      />
    </>
  );
}
