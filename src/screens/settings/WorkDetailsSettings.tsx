import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {format, addDays} from 'date-fns';
import {useSettingsStore} from '../../store/settingsStore';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import TimePicker from '../../components/ui/TimePicker';
import {hhmmToIsoOn, formatTime, todayDate} from '../../utils/dateUtils';
import {getDateFnsLocale} from '../../i18n';
import type {WeekdayOverride} from '../../utils/usualHours';

// Mon-first display order. 2024-01-01 was a Monday; getDay() maps back to the
// JS weekday index (0=Sun) used as the storage key.
const MONDAY = new Date(2024, 0, 1);

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    modePill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: c.primary,
      backgroundColor: c.primary + '12',
    },
    modePillText: {fontSize: typography.sizes.sm, color: c.primary, fontWeight: typography.weights.semibold},
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    customSep: {color: c.textMuted, fontSize: typography.sizes.base},
    hint: {paddingHorizontal: spacing.lg, marginBottom: spacing.xs},
    payPeriodInput: {
      width: 72,
      minHeight: 44,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      color: c.textPrimary,
      backgroundColor: c.bg,
      textAlign: 'center',
      fontSize: typography.sizes.base,
    },
  });

export default function WorkDetailsSettings() {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);
  const {
    usual_start, setUsualStart, usual_end, setUsualEnd,
    prefill_from_usual, setPrefillFromUsual,
    weekday_hours, setWeekdayOverride,
    pay_period_start_day, setPayPeriodStartDay,
  } = useSettingsStore();
  const [payPeriodInput, setPayPeriodInput] = useState(
    String(pay_period_start_day),
  );

  useEffect(() => {
    setPayPeriodInput(String(pay_period_start_day));
  }, [pay_period_start_day]);

  const savePayPeriod = async () => {
    const day = Number(payPeriodInput);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setPayPeriodInput(String(pay_period_start_day));
      return;
    }
    await setPayPeriodStartDay(day);
  };

  const today = todayDate();
  const locale = getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en');
  const usualStartIso = usual_start ? hhmmToIsoOn(today, usual_start) : null;
  const usualEndIso = usual_end ? hhmmToIsoOn(today, usual_end) : null;

  // Cycle Default → Custom → Day off → Default. Custom seeds from the default.
  const cycle = (jsDay: number, ov: WeekdayOverride | undefined) => {
    if (!ov) {
      setWeekdayOverride(jsDay, {
        start: usual_start ?? '09:00',
        end: usual_end ?? '17:00',
      });
    } else if ('off' in ov) {
      setWeekdayOverride(jsDay, null);
    } else {
      setWeekdayOverride(jsDay, {off: true});
    }
  };

  const weekdays = Array.from({length: 7}, (_, i) => {
    const date = addDays(MONDAY, i);
    return {jsDay: date.getDay(), name: format(date, 'EEEE', {locale})};
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('settings.defaultHours')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.usualStart')}</Text>
          <TimePicker
            value={usualStartIso}
            placeholder={t('settings.timeNotSet')}
            onChange={iso => setUsualStart(formatTime(iso))}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.usualEnd')}</Text>
          <TimePicker
            value={usualEndIso}
            placeholder={t('settings.timeNotSet')}
            onChange={iso => setUsualEnd(formatTime(iso))}
          />
        </View>

        <TouchableOpacity style={styles.row} onPress={() => setPrefillFromUsual(!prefill_from_usual)}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.prefillNewDays')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.prefillNewDaysDescription')}</Text>
          </View>
          <View style={[styles.toggle, prefill_from_usual && styles.toggleOn]}>
            <Text style={[styles.toggleText, prefill_from_usual && styles.toggleTextOn]}>
              {prefill_from_usual ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t('settings.payPeriod')}</Text>
        <View style={styles.row}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.payPeriodStart')}</Text>
            <Text style={styles.rowSubLabel}>
              {t('settings.payPeriodHint', {
                start: pay_period_start_day,
                end: pay_period_start_day === 1
                  ? t('settings.monthEnd')
                  : pay_period_start_day - 1,
              })}
            </Text>
          </View>
          <TextInput
            style={local.payPeriodInput}
            value={payPeriodInput}
            onChangeText={setPayPeriodInput}
            onEndEditing={savePayPeriod}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
            accessibilityLabel={t('settings.payPeriodStart')}
          />
        </View>

        <Text style={styles.sectionHeader}>{t('settings.perWeekday')}</Text>
        <Text style={[styles.rowSubLabel, local.hint]}>
          {t('settings.perWeekdayHint')}
        </Text>

        {weekdays.map(({jsDay, name}) => {
          const ov = weekday_hours[jsDay];
          const mode = !ov ? 'default' : 'off' in ov ? 'off' : 'custom';
          const startIso = ov && 'start' in ov ? hhmmToIsoOn(today, ov.start) : null;
          const endIso = ov && 'end' in ov ? hhmmToIsoOn(today, ov.end) : null;
          return (
            <View key={jsDay}>
              <TouchableOpacity style={styles.row} onPress={() => cycle(jsDay, ov)}>
                <Text style={styles.rowLabel}>{name}</Text>
                <View style={local.modePill}>
                  <Text style={local.modePillText}>{t(`settings.weekdayMode_${mode}`)}</Text>
                </View>
              </TouchableOpacity>
              {mode === 'custom' && (
                <View style={local.customRow}>
                  <TimePicker
                    value={startIso}
                    baseDate={today}
                    onChange={iso => setWeekdayOverride(jsDay, {start: formatTime(iso), end: (ov as {end: string}).end})}
                  />
                  <Text style={local.customSep}>→</Text>
                  <TimePicker
                    value={endIso}
                    baseDate={today}
                    onChange={iso => setWeekdayOverride(jsDay, {start: (ov as {start: string}).start, end: formatTime(iso)})}
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
