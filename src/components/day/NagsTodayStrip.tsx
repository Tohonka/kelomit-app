import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {getNags, getNagDoneMap} from '../../db/nags';
import {markNagDone} from '../../services/nagService';
import {occurrences} from '../../utils/nagSchedule';
import {todayDate} from '../../utils/dateUtils';
import {formatTime, localDateOf} from '../../utils/timeFormat';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Nag} from '../../types';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    header: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    row: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    title: {flex: 1, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.textPrimary},
    titleDone: {color: c.textMuted, textDecorationLine: 'line-through'},
    time: {fontSize: typography.sizes.sm, color: c.primary, fontWeight: typography.weights.semibold},
    overdue: {color: c.error},
    check: {width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: c.primary, alignItems: 'center', justifyContent: 'center'},
    checkOn: {backgroundColor: c.primary},
  });

interface Item { nag: Nag; dueAt: string; doneAt: string | null }

/** Today's nag occurrences (undone ones and those done today) with a check. */
export default function NagsTodayStrip({onChanged}: {onChanged?: () => void}) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const nags = await getNags();
    const done = await getNagDoneMap(nags.map(n => n.id));
    const today = todayDate();
    const out: Item[] = [];
    for (const nag of nags) {
      for (const dueAt of occurrences(nag.schedule, Date.now(), 1)) {
        const doneAt = done.get(`${nag.id}|${dueAt}`) ?? null;
        const isToday = localDateOf(dueAt) === today;
        // Overdue from yesterday stays until done; done ones show only today.
        if ((isToday && (!doneAt || localDateOf(doneAt) === today)) || (!isToday && !doneAt && Date.parse(dueAt) < Date.now())) {
          out.push({nag, dueAt, doneAt});
        }
      }
    }
    out.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    setItems(out);
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  if (items.length === 0) { return null; }
  return (
    <View>
      <Text style={styles.header}>{t('nags.homeStrip')}</Text>
      {items.map(it => {
        const overdue = !it.doneAt && Date.parse(it.dueAt) < Date.now();
        return (
          <View key={`${it.nag.id}|${it.dueAt}`} style={styles.row}>
            <Text style={[styles.title, it.doneAt && styles.titleDone]}>{it.nag.title}</Text>
            <Text style={[styles.time, overdue && styles.overdue]}>{formatTime(it.dueAt)}</Text>
            <TouchableOpacity
              style={[styles.check, it.doneAt && styles.checkOn]}
              accessibilityLabel={t('common.done')}
              onPress={() => markNagDone(it.nag, it.dueAt, !it.doneAt).then(() => { load(); onChanged?.(); }).catch(() => {})}>
              <Icon name="check" size={22} color={it.doneAt ? colors.white : colors.primary} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
