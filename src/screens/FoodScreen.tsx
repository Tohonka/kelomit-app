import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ToastAndroid,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useShellPadding} from '../navigation/shellMetrics';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import ActionSheet from '../components/ui/ActionSheet';
import Bounceable from '../components/ui/Bounceable';
import {getDayByDate, getOrCreateDay} from '../db/days';
import {
  createFoodEntry,
  deleteFoodEntry,
  getFoodEntriesForDay,
  getRecentFoodEntries,
} from '../db/food';
import {rankRecents, type RecentFood} from '../utils/foodMath';
import {formatDate, formatTime, shiftDate, todayDate} from '../utils/dateUtils';
import {deleteMediaFile, fileUri} from '../utils/mediaUtils';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import type {TabScreenProps} from '../navigation/navigationTypes';
import type {FoodEntry} from '../types';

// Recents are ranked from the last two months of entries.
const RECENT_DAYS = 60;
const THUMB = 40;

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
    navBtn: {padding: spacing.xs},
    navBtnDisabled: {opacity: 0.3},
    dayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summary: {
      textAlign: 'center',
      marginTop: spacing.xs,
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
    },
    sectionLabel: {
      marginTop: spacing.lg,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xs,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    recentsRow: {paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row'},
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: c.textPrimary},
    chipKcal: {fontSize: typography.sizes.xs, color: c.textMuted},
    list: {marginTop: spacing.md, marginHorizontal: spacing.lg, gap: spacing.sm},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    time: {fontSize: typography.sizes.sm, color: c.textMuted, width: 44},
    thumb: {width: THUMB, height: THUMB, borderRadius: radius.sm, backgroundColor: c.bgMuted},
    flex1: {flex: 1},
    name: {fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.textPrimary},
    note: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    kcal: {fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: c.textSecondary},
    againBtn: {padding: spacing.xs},
    empty: {padding: spacing.xxl, alignItems: 'center'},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
  });

export default function FoodScreen({navigation}: TabScreenProps<'Food'>) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const [date, setDate] = useState(todayDate());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [target, setTarget] = useState<FoodEntry | null>(null);

  // Read-only day lookup: browsing days must not create day rows.
  const load = useCallback(async (d: string) => {
    const day = await getDayByDate(d);
    const rows = day ? await getFoodEntriesForDay(day.id) : [];
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const recentRows = await getRecentFoodEntries(since);
    const now = new Date();
    setEntries(rows);
    setRecents(rankRecents(recentRows, now.getHours() * 60 + now.getMinutes()));
  }, []);

  useFocusEffect(useCallback(() => { load(date).catch(() => {}); }, [load, date]));

  const isToday = date === todayDate();

  // One tap, no screen: a copy of the template lands on today at "now".
  const addAgain = async (tpl: RecentFood) => {
    try {
      const today = todayDate();
      const day = await getOrCreateDay(today);
      await createFoodEntry({
        day_id: day.id,
        eaten_at: new Date().toISOString(),
        name: tpl.name,
        kcal: tpl.kcal,
        product_id: tpl.product_id,
        quantity: tpl.quantity,
        unit: tpl.unit,
      });
      haptic(HAPTIC_SAVE);
      ToastAndroid.show(t('food.added'), ToastAndroid.SHORT);
      if (date !== today) { setDate(today); } else { await load(today); }
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  };

  const confirmDelete = (e: FoodEntry) => {
    Alert.alert(t('food.deleteTitle'), t('food.deleteMessage', {name: e.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteFoodEntry(e.id);
          await deleteMediaFile(e.file_path);
          load(date).catch(() => {});
        },
      },
    ]);
  };

  const actions = (e: FoodEntry) => [
    {label: t('food.addAgain'), onPress: () => { addAgain(e); }},
    {
      label: t('food.duplicate'),
      onPress: () =>
        navigation.navigate('FoodEntryModal', {
          date: todayDate(),
          prefill: {name: e.name, kcal: e.kcal, product_id: e.product_id, quantity: e.quantity, unit: e.unit},
        }),
    },
    {label: t('common.edit'), onPress: () => navigation.navigate('FoodEntryModal', {entryId: e.id})},
    {label: t('common.delete'), destructive: true, onPress: () => confirmDelete(e)},
  ];

  const kcalTotal = entries.reduce((sum, e) => sum + (e.kcal ?? 0), 0);
  const withoutKcal = entries.filter(e => e.kcal == null).length;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{paddingTop: shellPad.paddingTop}}
        contentContainerStyle={{paddingBottom: shellPad.paddingBottom + spacing.xl}}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.navBtn}
            accessibilityLabel={t('dates.previousDay')}
            onPress={() => setDate(shiftDate(date, -1))}>
            <Icon name="chevron-left" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.dayLabel}>{formatDate(date)}</Text>
          <TouchableOpacity
            style={[styles.navBtn, isToday && styles.navBtnDisabled]}
            disabled={isToday}
            accessibilityLabel={t('dates.nextDay')}
            onPress={() => setDate(shiftDate(date, 1))}>
            <Icon name="chevron-right" size={28} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            accessibilityLabel={t('food.logFood')}
            onPress={() => navigation.navigate('FoodEntryModal', {date})}>
            <Icon name="plus" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
        {entries.length > 0 && (
          <Text style={styles.summary}>
            {t('food.summary', {kcal: kcalTotal, n: entries.length})}
            {withoutKcal > 0 ? ` · ${t('food.withoutKcal', {n: withoutKcal})}` : ''}
          </Text>
        )}

        {recents.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t('food.recents')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsRow}>
              {recents.map(r => (
                <Bounceable
                  key={`${r.product_id ?? 'n'}-${r.name.toLowerCase()}`}
                  style={styles.chip}
                  haptic
                  accessibilityLabel={`${t('food.addAgain')}: ${r.name}`}
                  onPress={() => addAgain(r)}>
                  <Icon name="plus" size={14} color={colors.primary} />
                  <Text style={styles.chipText} numberOfLines={1}>{r.name}</Text>
                  {r.kcal != null && <Text style={styles.chipKcal}>{r.kcal}</Text>}
                </Bounceable>
              ))}
            </ScrollView>
          </>
        )}

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('food.emptyDay')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {entries.map(e => {
              const thumb = e.thumbnail_path || e.file_path;
              return (
                <Bounceable
                  key={e.id}
                  style={styles.row}
                  onPress={() => navigation.navigate('FoodEntryModal', {entryId: e.id})}
                  onLongPress={() => setTarget(e)}
                  delayLongPress={300}>
                  <Text style={styles.time}>{formatTime(e.eaten_at)}</Text>
                  {thumb ? <Image source={{uri: fileUri(thumb)}} style={styles.thumb} /> : null}
                  <View style={styles.flex1}>
                    <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                    {!!e.note && <Text style={styles.note} numberOfLines={1}>{e.note}</Text>}
                  </View>
                  <Text style={styles.kcal}>{e.kcal != null ? String(e.kcal) : '–'}</Text>
                  <TouchableOpacity
                    style={styles.againBtn}
                    accessibilityLabel={t('food.addAgain')}
                    hitSlop={8}
                    onPress={() => addAgain(e)}>
                    <Icon name="repeat" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </Bounceable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={target != null}
        title={target?.name}
        onClose={() => setTarget(null)}
        actions={target ? actions(target) : []}
      />
    </View>
  );
}
