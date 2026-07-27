import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTranslation} from 'react-i18next';
import {
  createLeaveRange,
  deleteLeaveRange,
  getLeaveRange,
  updateLeaveRange,
} from '../../db/leaveRanges';
import type {LeaveType} from '../../types';
import {radius, spacing, typography, useTheme} from '../../theme';
import type {Colors} from '../../theme';

interface LeaveEditorProps {
  initialDate: string;
  leaveRangeId?: number;
  onSaved: () => void;
}

type Picker = 'start' | 'end' | null;

const TYPES: Array<{type: LeaveType; key: string}> = [
  {type: 'paid_day_off', key: 'leave.paidDayOff'},
  {type: 'unpaid_day_off', key: 'leave.unpaidDayOff'},
  {type: 'vacation', key: 'leave.vacation'},
  {type: 'sick', key: 'leave.sick'},
];

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pickerDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  choices: {gap: spacing.sm},
  choice: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  selected: {borderColor: colors.primary, backgroundColor: colors.primary + '15'},
  choiceText: {color: colors.textPrimary, fontSize: typography.sizes.base},
  selectedText: {color: colors.primary, fontWeight: typography.weights.semibold},
  dateRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg},
  date: {
    flex: 1,
    minHeight: 56,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
  },
  dateLabel: {color: colors.textMuted, fontSize: typography.sizes.xs},
  dateValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    marginTop: 2,
  },
  action: {
    minHeight: 52,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionText: {
    color: colors.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
  },
  delete: {backgroundColor: colors.error, marginTop: spacing.md},
  disabled: {opacity: 0.45},
});

export default function LeaveEditor({
  initialDate,
  leaveRangeId,
  onSaved,
}: LeaveEditorProps) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [type, setType] = useState<LeaveType>('paid_day_off');
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [picker, setPicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(leaveRangeId != null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (leaveRangeId == null) {
      return;
    }
    let active = true;
    getLeaveRange(leaveRangeId)
      .then(range => {
        if (!active) { return; }
        if (!range) {
          throw new Error('leave_not_found');
        }
        setType(range.type);
        setStartDate(range.start_date);
        setEndDate(range.end_date);
      })
      .catch(() => {
        if (active) {
          Alert.alert(t('common.error'), t('leave.loadFailed'));
        }
      })
      .finally(() => {
        if (active) { setLoading(false); }
      });
    return () => {
      active = false;
    };
  }, [leaveRangeId, t]);

  const showError = (error: unknown) => {
    const code = error instanceof Error ? error.message : '';
    const key = code === 'leave_overlap'
      ? 'leave.overlap'
      : code === 'leave_invalid_range'
        ? 'leave.invalidRange'
        : 'leave.saveFailed';
    Alert.alert(t('common.error'), t(key));
  };

  const save = async () => {
    if (saving) { return; }
    setSaving(true);
    try {
      const input = {type, startDate, endDate};
      if (leaveRangeId == null) {
        await createLeaveRange(input);
      } else {
        await updateLeaveRange(leaveRangeId, input);
      }
      onSaved();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (leaveRangeId == null || saving) { return; }
    Alert.alert(t('leave.deleteTitle'), t('leave.deleteMessage'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deleteLeaveRange(leaveRangeId);
            onSaved();
          } catch (error) {
            showError(error);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return null;
  }

  return (
    <View>
      <View style={styles.choices}>
        {TYPES.map(option => (
          <TouchableOpacity
            key={option.type}
            style={[styles.choice, type === option.type && styles.selected]}
            onPress={() => setType(option.type)}
            accessibilityRole="radio"
            accessibilityState={{checked: type === option.type}}
            accessibilityLabel={t(option.key)}>
            <Text style={[
              styles.choiceText,
              type === option.type && styles.selectedText,
            ]}>
              {t(option.key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dateRow}>
        {([
          ['start', startDate, 'leave.startDate'],
          ['end', endDate, 'leave.endDate'],
        ] as const).map(([target, value, label]) => (
          <TouchableOpacity
            key={target}
            style={styles.date}
            onPress={() => setPicker(target)}
            accessibilityRole="button"
            accessibilityLabel={t(label)}>
            <Text style={styles.dateLabel}>{t(label)}</Text>
            <Text style={styles.dateValue}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {picker && (
        <DateTimePicker
          testID="leave-date-picker"
          value={pickerDate(picker === 'start' ? startDate : endDate)}
          mode="date"
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          maximumDate={picker === 'start' ? pickerDate(endDate) : undefined}
          minimumDate={picker === 'end' ? pickerDate(startDate) : undefined}
          onChange={(_event, selected) => {
            if (selected) {
              const value = localDate(selected);
              if (picker === 'start') {
                setStartDate(value);
              } else {
                setEndDate(value);
              }
            }
            setPicker(null);
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.action, saving && styles.disabled]}
        onPress={save}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={leaveRangeId == null ? t('common.save') : t('common.update')}>
        <Text style={styles.actionText}>
          {leaveRangeId == null ? t('common.save') : t('common.update')}
        </Text>
      </TouchableOpacity>

      {leaveRangeId != null && (
        <TouchableOpacity
          style={[styles.action, styles.delete, saving && styles.disabled]}
          onPress={remove}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}>
          <Text style={styles.actionText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
