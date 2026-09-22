import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import notifee from '@notifee/react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useShellPadding} from '../navigation/shellMetrics';
import {getNags, getNagDoneMap} from '../db/nags';
import {exactAlarmsAllowed, markNagDone} from '../services/nagService';
import {nextOccurrence} from '../utils/nagSchedule';
import {formatDate, todayDate} from '../utils/dateUtils';
import {formatTime, localDateOf} from '../utils/timeFormat';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';
import type {Nag} from '../types';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm},
    title: {flex: 1, fontSize: typography.sizes.xl, fontWeight: typography.weights.black, color: c.textPrimary},
    addBtn: {width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center'},
    banner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.error + '22',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    bannerText: {flex: 1, fontSize: typography.sizes.sm, color: c.textPrimary},
    bannerBtn: {color: c.primary, fontWeight: typography.weights.bold},
    empty: {padding: spacing.xl, textAlign: 'center', color: c.textMuted, fontSize: typography.sizes.base},
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    cardTitle: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.textPrimary},
    cardSub: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    due: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.primary, marginTop: 4},
    overdue: {color: c.error},
    check: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: {backgroundColor: c.primary},
    body: {flex: 1},
  });

/** "Today 14:00" / "Tomorrow 09:00" / "Wed 24 Sep 09:00" / "Overdue · 13:00". */
export function describeDue(dueAt: string, t: (k: string) => string, nowMs = Date.now()): {text: string; overdue: boolean} {
  const day = localDateOf(dueAt);
  const today = todayDate();
  const tomorrow = localDateOf(new Date(Date.parse(today + 'T12:00:00') + 86_400_000).toISOString());
  const time = formatTime(dueAt);
  if (Date.parse(dueAt) < nowMs) { return {text: `${t('nags.overdue')} · ${time}`, overdue: true}; }
  const label = day === today ? t('nags.today') : day === tomorrow ? t('nags.tomorrow') : formatDate(day);
  return {text: `${label} ${time}`, overdue: false};
}

export default function NagsScreen({navigation}: TabScreenProps<'Nags'>) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const [nags, setNags] = useState<Nag[]>([]);
  const [done, setDone] = useState<Map<string, string>>(new Map());
  const [alarmsOk, setAlarmsOk] = useState(true);

  const load = useCallback(async () => {
    const list = await getNags();
    setNags(list);
    setDone(await getNagDoneMap(list.map(n => n.id)));
    setAlarmsOk(await exactAlarmsAllowed().catch(() => true));
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const scheduleLine = (n: Nag) => {
    const s = n.schedule;
    if (s.kind === 'once') { return t('nags.kindOnce'); }
    if (s.kind === 'dates') { return `${t('nags.kindDates')} · ${s.at.length}`; }
    return `${t('nags.kindWeekly')} · ${s.time}`;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{paddingTop: shellPad.paddingTop, paddingBottom: shellPad.paddingBottom}}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('nags.title')}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('NagEditModal')} accessibilityLabel={t('nags.new')}>
            <Icon name="plus" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        {!alarmsOk && (
          <View style={styles.banner}>
            <Icon name="alarm-off" size={20} color={colors.error} />
            <Text style={styles.bannerText}>{t('nags.alarmBanner')}</Text>
            <TouchableOpacity onPress={() => notifee.openAlarmPermissionSettings().catch(() => {})}>
              <Text style={styles.bannerBtn}>{t('nags.alarmFix')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {nags.length === 0 && <Text style={styles.empty}>{t('nags.empty')}</Text>}
        {nags.map(n => {
          const next = nextOccurrence(n, done, Date.now());
          const due = next ? describeDue(next, t) : null;
          // The check marks the next occurrence done when it is today or overdue.
          const checkable = next != null && (due?.overdue || localDateOf(next) === todayDate());
          return (
            <TouchableOpacity key={n.id} style={styles.card} onPress={() => navigation.navigate('NagEditModal', {nagId: n.id})} activeOpacity={0.8}>
              <View style={styles.body}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text style={styles.cardSub}>{scheduleLine(n)}</Text>
                <Text style={[styles.due, due?.overdue && styles.overdue]}>
                  {due ? `${t('nags.nextDue')}: ${due.text}` : t('nags.noNext')}
                </Text>
              </View>
              {checkable && next && (
                <TouchableOpacity
                  style={styles.check}
                  accessibilityLabel={t('common.done')}
                  onPress={() => markNagDone(n, next).then(load).catch(() => {})}>
                  <Icon name="check" size={26} color={colors.primary} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
