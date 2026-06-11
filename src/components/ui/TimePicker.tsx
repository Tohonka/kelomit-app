import React, {useMemo, useState} from 'react';
import {TouchableOpacity, Text, StyleSheet, Platform} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {formatTime} from '../../utils/dateUtils';

interface Props {
  value: string | null;
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

export default function TimePicker({value, placeholder = '–:––', onChange}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [show, setShow] = useState(false);
  const date = value ? new Date(value) : new Date();

  return (
    <>
      <TouchableOpacity style={styles.btn} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatTime(value) : placeholder}
        </Text>
      </TouchableOpacity>

      {show && (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display={Platform.OS === 'android' ? 'spinner' : 'spinner'}
          onChange={(_event, selected) => {
            setShow(false);
            if (selected) { onChange(selected.toISOString()); }
          }}
        />
      )}
    </>
  );
}
