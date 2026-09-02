import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {format} from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useShellPadding} from '../navigation/shellMetrics';
import {useHabitStore} from '../store/habitStore';
import {archiveCategory, archiveHabit, deleteCategory, deleteHabit} from '../db/habits';
import {monthDate, shiftMonth} from '../utils/habitMonth';
import {getDateFnsLocale} from '../i18n';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import ActionSheet from '../components/ui/ActionSheet';
import HabitMatrix from '../components/habits/HabitMatrix';
import type {TabScreenProps} from '../navigation/navigationTypes';
import type {Habit, HabitCategory} from '../types';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    monthBtn: {padding: spacing.xs},
    monthLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      textTransform: 'capitalize',
    },
    addCatBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.lg,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    catHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
    catIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    catTitle: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.textPrimary},
    catSub: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    habit: {marginTop: spacing.lg},
    habitHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs},
    habitTitle: {flex: 1, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.textPrimary},
    habitGoal: {fontSize: typography.sizes.xs, color: c.textMuted},
    addHabit: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    addHabitText: {color: c.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm},
    empty: {padding: spacing.xxl, alignItems: 'center', gap: spacing.md},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
  });

type Target = {kind: 'category'; item: HabitCategory} | {kind: 'habit'; item: Habit};

export default function HabitsScreen({navigation}: TabScreenProps<'Habits'>) {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const {categories, habits, month, load, setMonth} = useHabitStore();
  const [target, setTarget] = useState<Target | null>(null);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const monthLabel = format(monthDate(month), 'LLLL yyyy', {locale: getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en')});

  const goalText = (h: Habit) => {
    if (h.goal_kind === 'minutes') { return t('habits.minutesPerDay', {n: h.goal_value}); }
    if (h.goal_kind === 'count') { return t('habits.timesPerDay', {n: h.goal_value}); }
    return null;
  };

  const confirmDelete = (tg: Target) => {
    const isCat = tg.kind === 'category';
    Alert.alert(
      t(isCat ? 'habits.deleteCategoryTitle' : 'habits.deleteHabitTitle'),
      t(isCat ? 'habits.deleteCategoryMessage' : 'habits.deleteHabitMessage', {name: tg.item.title}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await (isCat ? deleteCategory(tg.item.id) : deleteHabit(tg.item.id));
            load();
          },
        },
      ],
    );
  };

  const actions = (tg: Target) => [
    {
      label: t('common.edit'),
      onPress: () =>
        navigation.navigate('HabitEditModal',
          tg.kind === 'category'
            ? {mode: 'category', categoryId: tg.item.id}
            : {mode: 'habit', categoryId: tg.item.category_id, habitId: tg.item.id}),
    },
    {
      // ponytail: archive hides; no unarchive UI yet — add a "show archived" toggle when needed.
      label: t('common.archive'),
      onPress: async () => {
        await (tg.kind === 'category' ? archiveCategory(tg.item.id) : archiveHabit(tg.item.id));
        load();
      },
    },
    {label: t('common.delete'), destructive: true, onPress: () => confirmDelete(tg)},
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={{paddingTop: shellPad.paddingTop}}
        contentContainerStyle={{paddingBottom: shellPad.paddingBottom + spacing.xl}}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.monthBtn} onPress={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="chevron-left" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.monthBtn} onPress={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="chevron-right" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addCatBtn}
            accessibilityLabel={t('habits.newCategory')}
            onPress={() => navigation.navigate('HabitEditModal', {mode: 'category'})}>
            <Icon name="plus" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {categories.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('habits.empty')}</Text>
          </View>
        )}

        {categories.map(cat => {
          const catHabits = habits.filter(h => h.category_id === cat.id);
          return (
            <View key={cat.id} style={styles.card}>
              <TouchableOpacity
                style={styles.catHead}
                onLongPress={() => setTarget({kind: 'category', item: cat})}
                delayLongPress={300}
                activeOpacity={0.7}>
                <View style={styles.catIcon}>
                  <Icon name={cat.icon} size={22} color={colors.primary} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.catTitle}>{cat.title}</Text>
                  {!!cat.description && <Text style={styles.catSub}>{cat.description}</Text>}
                </View>
                <Icon name="dots-horizontal" size={20} color={colors.textMuted} />
              </TouchableOpacity>

              {catHabits.length === 0 && <Text style={[styles.catSub, styles.habit]}>{t('habits.noHabits')}</Text>}
              {catHabits.map(h => (
                <View key={h.id} style={styles.habit}>
                  <TouchableOpacity
                    style={styles.habitHead}
                    onLongPress={() => setTarget({kind: 'habit', item: h})}
                    delayLongPress={300}
                    activeOpacity={0.7}>
                    <Icon name={h.icon} size={18} color={colors.textSecondary} />
                    <Text style={styles.habitTitle}>{h.title}</Text>
                    {goalText(h) && <Text style={styles.habitGoal}>{goalText(h)}</Text>}
                  </TouchableOpacity>
                  <HabitMatrix habitId={h.id} month={month} />
                </View>
              ))}

              <TouchableOpacity
                style={styles.addHabit}
                onPress={() => navigation.navigate('HabitEditModal', {mode: 'habit', categoryId: cat.id})}>
                <Icon name="plus" size={16} color={colors.primary} />
                <Text style={styles.addHabitText}>{t('habits.newHabit')}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <ActionSheet
        visible={target != null}
        title={target?.item.title}
        onClose={() => setTarget(null)}
        actions={target ? actions(target) : []}
      />
    </View>
  );
}
