import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {format} from 'date-fns';
import {createNag, deleteNag, getNag, updateNag, type NagFields} from '../db/nags';
import {syncNagTriggers} from '../services/nagService';
import {requestNotificationPermission} from '../services/notificationService';
import Button from '../components/ui/Button';
import TimePicker from '../components/ui/TimePicker';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {getDateFnsLocale} from '../i18n';
import {formatDate, hhmmToIsoOn, todayDate} from '../utils/dateUtils';
import {localDateOf} from '../utils/timeFormat';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {NagPlan, NagSchedule} from '../types';

type Kind = NagSchedule['kind'];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl},
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
    },
    hint: {fontSize: typography.sizes.xs, color: c.textMuted, marginBottom: spacing.sm},
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    numInput: {minWidth: 56, textAlign: 'center', minHeight: 44, paddingVertical: 4},
    segRow: {flexDirection: 'row', gap: spacing.sm},
    seg: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: 'center',
    },
    segActive: {borderColor: c.primary, backgroundColor: c.primary + '22'},
    segText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.textMuted},
    segTextActive: {color: c.primary},
    row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap'},
    rowText: {fontSize: typography.sizes.sm, color: c.textPrimary},
    dateBtn: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    dateText: {fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: c.textPrimary},
    chip: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '22'},
    chipText: {fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: c.textMuted},
    chipTextActive: {color: c.primary},
    toggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
    toggle: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
    },
    toggleOn: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    toggleText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.textMuted},
    toggleTextOn: {color: c.primary},
    planCard: {
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    removeBtn: {padding: spacing.xs},
    deleteText: {color: c.error, textAlign: 'center', fontWeight: typography.weights.semibold, paddingVertical: spacing.md},
  });

function hhmmOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function withDate(iso: string, date: Date): string {
  const d = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), d.getHours(), d.getMinutes()).toISOString();
}
function defaultAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
const num = (s: string, fallback: number) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

type Styles = ReturnType<typeof makeStyles>;

function ToggleChip({on, onPress, styles, t}: {on: boolean; onPress: () => void; styles: Styles; t: (k: string) => string}) {
  return (
    <TouchableOpacity style={[styles.toggle, on && styles.toggleOn]} onPress={onPress}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{t(on ? 'common.on' : 'common.off')}</Text>
    </TouchableOpacity>
  );
}
function SegRow<T extends string>({value, options, onChange, styles}: {
  value: T; options: {key: T; label: string}[]; onChange: (v: T) => void; styles: Styles;
}) {
  return (
    <View style={styles.segRow}>
      {options.map(o => (
        <TouchableOpacity key={o.key} style={[styles.seg, value === o.key && styles.segActive]} onPress={() => onChange(o.key)}>
          <Text style={[styles.segText, value === o.key && styles.segTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
function DateAtRow({iso, onDate, onTime, styles}: {iso: string; onDate: () => void; onTime: (v: string) => void; styles: Styles}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.dateBtn} onPress={onDate}>
        <Text style={styles.dateText}>{formatDate(localDateOf(iso))}</Text>
      </TouchableOpacity>
      <TimePicker value={iso} baseDate={localDateOf(iso)} onChange={onTime} />
    </View>
  );
}

export default function NagEditModal({route, navigation}: RootStackScreenProps<'NagEditModal'>) {
  const {t, i18n} = useTranslation();
  const nagId = route.params?.nagId;
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dfLocale = getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en');

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [activity, setActivity] = useState<'work' | 'personal'>('personal');
  const [kind, setKind] = useState<Kind>('once');
  const [onceAt, setOnceAt] = useState(defaultAt);
  const [dates, setDates] = useState<string[]>([defaultAt()]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeklyTime, setWeeklyTime] = useState('09:00');
  const [dayBefore, setDayBefore] = useState<string | null>(null);
  const [onDay, setOnDay] = useState<string | null>(null);
  const [hoursBefore, setHoursBefore] = useState<string>('');
  const [repeatOn, setRepeatOn] = useState(false);
  const [perHour, setPerHour] = useState('2');
  const [fromBefore, setFromBefore] = useState('1');
  const [untilAfter, setUntilAfter] = useState('2');
  const [random, setRandom] = useState(false);
  const [countdown, setCountdown] = useState(true);
  const [datePick, setDatePick] = useState<{target: 'once'} | {target: 'dates'; index: number} | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (nagId == null) { return; }
    getNag(nagId).then(n => {
      if (!n) { return; }
      setTitle(n.title);
      setNote(n.note ?? '');
      setActivity(n.activity_type);
      setKind(n.schedule.kind);
      if (n.schedule.kind === 'once') { setOnceAt(n.schedule.at); }
      if (n.schedule.kind === 'dates') { setDates(n.schedule.at.length ? n.schedule.at : [defaultAt()]); }
      if (n.schedule.kind === 'weekly') { setWeekdays(n.schedule.weekdays); setWeeklyTime(n.schedule.time); }
      setDayBefore(n.plan.dayBefore ?? null);
      setOnDay(n.plan.onDay ?? null);
      setHoursBefore(n.plan.hoursBefore != null ? String(n.plan.hoursBefore) : '');
      if (n.plan.repeat) {
        setRepeatOn(true);
        setPerHour(String(n.plan.repeat.perHour));
        setFromBefore(String(n.plan.repeat.fromHoursBefore));
        setUntilAfter(String(n.plan.repeat.untilHoursAfter));
        setRandom(n.plan.repeat.random);
      }
      setCountdown(n.countdown);
    });
  }, [nagId]);

  const schedule = (): NagSchedule => {
    if (kind === 'once') { return {kind, at: onceAt}; }
    if (kind === 'dates') { return {kind, at: [...dates].sort()}; }
    return {kind, weekdays: [...weekdays].sort(), time: weeklyTime};
  };
  const plan = (): NagPlan => {
    const p: NagPlan = {};
    if (dayBefore) { p.dayBefore = dayBefore; }
    if (onDay) { p.onDay = onDay; }
    const hb = num(hoursBefore, 0);
    if (hb > 0) { p.hoursBefore = hb; }
    if (repeatOn) {
      p.repeat = {
        perHour: Math.min(6, Math.max(1, Math.round(num(perHour, 1)))),
        fromHoursBefore: num(fromBefore, 1),
        untilHoursAfter: num(untilAfter, 2),
        random,
      };
    }
    return p;
  };
  const canSave = title.trim().length > 0 && (kind !== 'weekly' || weekdays.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const fields: NagFields = {
        title: title.trim(), note: note.trim() || null, activity_type: activity,
        schedule: schedule(), plan: plan(), countdown,
      };
      if (nagId != null) { await updateNag(nagId, fields); } else { await createNag(fields); }
      requestNotificationPermission().catch(() => {});
      await syncNagTriggers();
      haptic(HAPTIC_SAVE);
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (nagId == null) { return; }
    Alert.alert(t('nags.delete'), t('nags.deleteConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deleteNag(nagId);
        await syncNagTriggers();
        navigation.goBack();
      }},
    ]);
  };

  // Time-of-day pickers work on an ISO of today; only the HH:MM is kept.
  const timeOfDay = (hhmm: string | null, onChange: (hhmm: string) => void) => (
    <TimePicker value={hhmm ? hhmmToIsoOn(todayDate(), hhmm) : null} onChange={iso => onChange(hhmmOf(iso))} />
  );
  const weekdayLabel = (wd: number) => format(new Date(2026, 8, 20 + wd), 'EEEEEE', {locale: dfLocale}); // 2026-09-21 = Monday

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.label}>{t('nags.titleLabel')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('nags.titlePlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoFocus={nagId == null}
        />
      </View>
      <View>
        <Text style={styles.label}>{t('nags.noteLabel')}</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} multiline placeholderTextColor={colors.textMuted} />
      </View>
      <View>
        <Text style={styles.label}>{t('nags.workPersonal')}</Text>
        <SegRow
          styles={styles}
          value={activity}
          onChange={setActivity}
          options={[{key: 'work', label: t('activity.work')}, {key: 'personal', label: t('activity.personal')}]}
        />
      </View>

      <View>
        <Text style={styles.label}>{t('nags.when')}</Text>
        <SegRow
          styles={styles}
          value={kind}
          onChange={setKind}
          options={[
            {key: 'once', label: t('nags.kindOnce')},
            {key: 'dates', label: t('nags.kindDates')},
            {key: 'weekly', label: t('nags.kindWeekly')},
          ]}
        />
        <View style={{height: spacing.md}} />
        {kind === 'once' && (
          <DateAtRow styles={styles} iso={onceAt} onDate={() => setDatePick({target: 'once'})} onTime={setOnceAt} />
        )}
        {kind === 'dates' && (
          <View style={{gap: spacing.sm}}>
            {dates.map((iso, i) => (
              <View key={i} style={styles.row}>
                <DateAtRow
                  styles={styles}
                  iso={iso}
                  onDate={() => setDatePick({target: 'dates', index: i})}
                  onTime={v => setDates(ds => ds.map((d, j) => (j === i ? v : d)))}
                />
                {dates.length > 1 && (
                  <TouchableOpacity style={styles.removeBtn} onPress={() => setDates(ds => ds.filter((_, j) => j !== i))}>
                    <Icon name="close-circle-outline" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <Button label={t('nags.addDate')} variant="secondary" onPress={() => setDates(ds => [...ds, defaultAt()])} />
          </View>
        )}
        {kind === 'weekly' && (
          <View style={{gap: spacing.md}}>
            <View style={styles.row}>
              {[1, 2, 3, 4, 5, 6, 7].map(wd => {
                const on = weekdays.includes(wd);
                return (
                  <TouchableOpacity
                    key={wd}
                    style={[styles.chip, on && styles.chipActive]}
                    onPress={() => setWeekdays(ws => (on ? ws.filter(w => w !== wd) : [...ws, wd]))}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{weekdayLabel(wd)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t('nags.time')}</Text>
              {timeOfDay(weeklyTime, setWeeklyTime)}
            </View>
          </View>
        )}
      </View>

      <View>
        <Text style={styles.label}>{t('nags.nagging')}</Text>
        <Text style={styles.hint}>{t('nags.naggingHint')}</Text>
        <View style={styles.planCard}>
          <View style={styles.toggleRow}>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t('nags.dayBefore')}</Text>
              {dayBefore && timeOfDay(dayBefore, setDayBefore)}
            </View>
            <ToggleChip styles={styles} t={t} on={!!dayBefore} onPress={() => setDayBefore(v => (v ? null : '18:00'))} />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t('nags.onDay')}</Text>
              {onDay && timeOfDay(onDay, setOnDay)}
            </View>
            <ToggleChip styles={styles} t={t} on={!!onDay} onPress={() => setOnDay(v => (v ? null : '08:00'))} />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.row}>
              <Text style={styles.rowText}>{t('nags.hoursBefore')}</Text>
              <TextInput
                style={[styles.input, styles.numInput]}
                value={hoursBefore}
                onChangeText={setHoursBefore}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.rowText}>{t('nags.repeat')}</Text>
            <ToggleChip styles={styles} t={t} on={repeatOn} onPress={() => setRepeatOn(v => !v)} />
          </View>
          {repeatOn && (
            <>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.numInput]} value={perHour} onChangeText={setPerHour} keyboardType="numeric" />
                <Text style={styles.rowText}>{t('nags.perHour')}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowText}>{t('nags.fromBefore')}</Text>
                <TextInput style={[styles.input, styles.numInput]} value={fromBefore} onChangeText={setFromBefore} keyboardType="numeric" />
                <Text style={styles.rowText}>{t('nags.untilAfter')}</Text>
                <TextInput style={[styles.input, styles.numInput]} value={untilAfter} onChangeText={setUntilAfter} keyboardType="numeric" />
                <Text style={styles.rowText}>{t('nags.afterUnit')}</Text>
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.rowText}>{t('nags.random')}</Text>
                <ToggleChip styles={styles} t={t} on={random} onPress={() => setRandom(v => !v)} />
              </View>
            </>
          )}
          <View style={styles.toggleRow}>
            <Text style={styles.rowText}>{t('nags.countdown')}</Text>
            <ToggleChip styles={styles} t={t} on={countdown} onPress={() => setCountdown(v => !v)} />
          </View>
        </View>
      </View>

      <Button label={t('common.save')} onPress={save} disabled={!canSave} loading={saving} />
      {nagId != null && (
        <TouchableOpacity onPress={remove}>
          <Text style={styles.deleteText}>{t('nags.delete')}</Text>
        </TouchableOpacity>
      )}

      {datePick && (
        <DateTimePicker
          value={new Date(datePick.target === 'once' ? onceAt : dates[datePick.index])}
          mode="date"
          onChange={(_e, selected) => {
            const pick = datePick;
            setDatePick(null);
            if (!selected) { return; }
            if (pick.target === 'once') { setOnceAt(v => withDate(v, selected)); }
            else { setDates(ds => ds.map((d, j) => (j === pick.index ? withDate(d, selected) : d))); }
          }}
        />
      )}
    </ScrollView>
  );
}
