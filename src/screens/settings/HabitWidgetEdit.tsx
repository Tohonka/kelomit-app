import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {getHabits} from '../../db/habits';
import {syncHabitWidgets} from '../../services/habitWidgets';
import {nativeSetWidgetConfig, type HabitWidgetConfig} from '../../native/widgetSession';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Habit} from '../../types';

/** Widget slots; the native layout has exactly this many. */
export const HABIT_WIDGET_MAX = 5;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm},
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.sm,
    },
    hint: {fontSize: typography.sizes.sm, color: c.textMuted, lineHeight: 20},
    chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    chipText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    chipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    order: {fontSize: typography.sizes.xs, color: c.primary, fontWeight: typography.weights.bold},
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 44,
    },
    rowLabel: {fontSize: typography.sizes.base, color: c.textPrimary},
    rowValue: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.primary},
    saveBtn: {
      marginTop: spacing.md,
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.white},
    saved: {textAlign: 'center', marginTop: spacing.xs, fontSize: typography.sizes.xs, color: c.success},
  });

interface Props {
  appWidgetId: number;
  initial: HabitWidgetConfig;
}

/** Pick which habits (≤5, tap order = slot order) a habit widget shows. */
export default function HabitWidgetEdit({appWidgetId, initial}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [ids, setIds] = useState<number[]>(initial.habit_ids ?? []);
  const [showName, setShowName] = useState(!!initial.show_name);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getHabits().then(setHabits).catch(() => {}); }, []);

  const toggle = (id: number) =>
    setIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev.length < HABIT_WIDGET_MAX ? [...prev, id] : prev));

  const save = async () => {
    await nativeSetWidgetConfig(appWidgetId, {habit_ids: ids, show_name: showName});
    await syncHabitWidgets().catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t('widgets.habitsHint')}</Text>
        <Text style={styles.label}>{t('widgets.habitsPick')}</Text>
        <View style={styles.chips}>
          {habits.map(h => {
            const pos = ids.indexOf(h.id);
            const on = pos >= 0;
            return (
              <TouchableOpacity key={h.id} style={[styles.chip, on && styles.chipActive]} onPress={() => toggle(h.id)}>
                <Icon name={h.icon} size={16} color={h.color ?? (on ? colors.primary : colors.textSecondary)} />
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{h.title}</Text>
                {on && <Text style={styles.order}>{pos + 1}</Text>}
              </TouchableOpacity>
            );
          })}
          {habits.length === 0 && <Text style={styles.hint}>{t('habits.empty')}</Text>}
        </View>

        <TouchableOpacity style={styles.row} onPress={() => setShowName(v => !v)}>
          <Text style={styles.rowLabel}>{t('widgets.habitsShowName')}</Text>
          <Text style={styles.rowValue}>{showName ? t('common.on') : t('common.off')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        </TouchableOpacity>
        {saved && <Text style={styles.saved}>{t('widgets.saved')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
