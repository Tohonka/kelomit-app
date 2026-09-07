import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useHabitStore} from '../store/habitStore';
import {createCategory, createHabit, setMatchers, updateCategory, updateHabit} from '../db/habits';
import {getAllTriggers} from '../db/triggers';
import {useProjectStore} from '../store/projectStore';
import {useTagStore} from '../store/tagStore';
import {HABIT_COLORS, HABIT_ICONS} from '../components/habits/habitIcons';
import Button from '../components/ui/Button';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {HabitGoalKind, HabitMatcherKind, Trigger} from '../types';

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
    iconGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    iconChip: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconChipActive: {borderColor: c.primary, backgroundColor: c.primary + '22'},
    swatch: {width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: 'transparent'},
    swatchActive: {borderColor: c.textPrimary},
    suggestions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm},
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    segRow: {flexDirection: 'row', gap: spacing.sm},
    seg: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 11,
      alignItems: 'center',
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    segActive: {backgroundColor: c.primary + '22', borderColor: c.primary},
    segText: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
    segTextActive: {color: c.primary, fontWeight: typography.weights.bold},
    numRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
    numInput: {width: 96, textAlign: 'center'},
    numSuffix: {fontSize: typography.sizes.base, color: c.textSecondary},
    hint: {fontSize: typography.sizes.sm, color: c.textMuted, marginBottom: spacing.sm},
    chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    chipText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    chipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    keywordRow: {flexDirection: 'row', gap: spacing.sm},
    flex1: {flex: 1},
  });

const key = (kind: HabitMatcherKind, id: number) => `${kind}:${id}`;

interface Keyword { kind: HabitMatcherKind; id: number; name: string }
const KIND_ICON: Record<HabitMatcherKind, string> = {project: 'folder-outline', tag: 'pound', trigger: 'flash-outline'};

export default function HabitEditModal({route, navigation}: RootStackScreenProps<'HabitEditModal'>) {
  const {mode, categoryId, habitId} = route.params;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {categories, habits, matchers: allMatchers, load} = useHabitStore();
  const projects = useProjectStore(s => s.projects);
  const loadProjects = useProjectStore(s => s.load);
  const tags = useTagStore(s => s.tags);
  const loadTags = useTagStore(s => s.load);
  const getOrCreateTag = useTagStore(s => s.getOrCreate);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((habitId ? allMatchers.get(habitId) ?? [] : []).map(m => key(m.kind, m.ref_id))),
  );
  useEffect(() => {
    if (mode !== 'habit') { return; }
    loadProjects();
    loadTags();
    getAllTriggers().then(setTriggers);
  }, [mode, loadProjects, loadTags]);

  // One flat keyword list over projects / tags / triggers — picked note-screen
  // style (type → suggestions → chips) instead of scrolling every chip.
  const options: Keyword[] = useMemo(
    () => [
      ...projects.map(p => ({kind: 'project' as const, id: p.id, name: p.name})),
      ...tags.map(tg => ({kind: 'tag' as const, id: tg.id, name: tg.name})),
      ...triggers.map(tr => ({kind: 'trigger' as const, id: tr.id, name: tr.name})),
    ],
    [projects, tags, triggers],
  );
  const chosen = options.filter(o => selected.has(key(o.kind, o.id)));
  const q = keyword.trim().toLowerCase();
  const suggestions = q
    ? options.filter(o => o.name.toLowerCase().startsWith(q) && !selected.has(key(o.kind, o.id))).slice(0, 8)
    : [];

  const select = (kind: HabitMatcherKind, id: number) => {
    setSelected(prev => new Set(prev).add(key(kind, id)));
    setKeyword('');
  };
  const unselect = (k: string) =>
    setSelected(prev => { const next = new Set(prev); next.delete(k); return next; });

  // Enter/Add: an exact existing keyword is selected; anything else becomes a
  // tag (not a trigger — a trigger can't be put on a note, so it would never match).
  const addKeyword = async () => {
    if (!q) { return; }
    const exact = options.find(o => o.name.toLowerCase() === q && !selected.has(key(o.kind, o.id)));
    if (exact) { select(exact.kind, exact.id); return; }
    const tag = await getOrCreateTag(keyword.trim());
    select('tag', tag.id);
  };
  const existing = mode === 'category'
    ? categories.find(c => c.id === categoryId)
    : habits.find(h => h.id === habitId);
  const existingHabit = mode === 'habit' && existing && 'goal_kind' in existing ? existing : null;
  const existingCat = mode === 'category' && existing && 'goal_streak_days' in existing ? existing : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? (mode === 'category' ? 'star-outline' : 'circle-outline'));
  const [color, setColor] = useState<string | null>(existingHabit?.color ?? null);
  const [streak, setStreak] = useState(existingCat?.goal_streak_days?.toString() ?? '');
  const [goalKind, setGoalKind] = useState<HabitGoalKind | null>(existingHabit?.goal_kind ?? null);
  const [goalValue, setGoalValue] = useState(existingHabit?.goal_value?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const parsedGoal = parseInt(goalValue, 10);
  const canSave = title.trim().length > 0 && (goalKind == null || parsedGoal > 0) && !saving;

  const save = async () => {
    setSaving(true);
    const base = {title: title.trim(), description: description.trim() || null, icon};
    if (mode === 'category') {
      const n = parseInt(streak, 10);
      const fields = {...base, goal_streak_days: n > 0 ? n : null};
      if (existingCat) { await updateCategory(existingCat.id, fields); } else { await createCategory(fields); }
    } else {
      const fields = {...base, color, goal_kind: goalKind, goal_value: goalKind ? parsedGoal : null};
      const id = existingHabit
        ? (await updateHabit(existingHabit.id, fields), existingHabit.id)
        : (await createHabit({...fields, category_id: categoryId!})).id;
      await setMatchers(
        id,
        [...selected].map(k => {
          const [kind, ref] = k.split(':');
          return {kind: kind as HabitMatcherKind, ref_id: Number(ref)};
        }),
      );
    }
    await load();
    navigation.goBack();
  };

  const GOALS: {key: HabitGoalKind | null; labelKey: string}[] = [
    {key: null, labelKey: 'habits.goalNone'},
    {key: 'minutes', labelKey: 'habits.goalMinutes'},
    {key: 'count', labelKey: 'habits.goalCount'},
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.label}>{t('habits.titleField')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('habits.titlePlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          autoFocus={!existing}
        />
      </View>
      <View>
        <Text style={styles.label}>{t('habits.description')}</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder={t('habits.descriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={200}
        />
      </View>
      <View>
        <Text style={styles.label}>{t('habits.icon')}</Text>
        <View style={styles.iconGrid}>
          {HABIT_ICONS.map(name => (
            <TouchableOpacity
              key={name}
              style={[styles.iconChip, icon === name && styles.iconChipActive]}
              onPress={() => setIcon(name)}>
              <Icon name={name} size={22} color={icon === name ? colors.primary : colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mode === 'habit' && (
        <View>
          <Text style={styles.label}>{t('habits.color')}</Text>
          <View style={styles.iconGrid}>
            {HABIT_COLORS.map(hex => (
              <TouchableOpacity
                key={hex}
                accessibilityLabel={hex}
                style={[styles.swatch, {backgroundColor: hex}, color === hex && styles.swatchActive]}
                onPress={() => setColor(color === hex ? null : hex)}
              />
            ))}
          </View>
        </View>
      )}

      {mode === 'category' ? (
        <View>
          <Text style={styles.label}>{t('habits.streakGoal')}</Text>
          <View style={styles.numRow}>
            <TextInput
              style={[styles.input, styles.numInput]}
              value={streak}
              onChangeText={setStreak}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="30"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.numSuffix}>{t('habits.days')}</Text>
          </View>
        </View>
      ) : (
        <View>
          <Text style={styles.label}>{t('habits.goal')}</Text>
          <View style={styles.segRow}>
            {GOALS.map(g => {
              const active = goalKind === g.key;
              return (
                <TouchableOpacity
                  key={String(g.key)}
                  style={[styles.seg, active && styles.segActive]}
                  onPress={() => setGoalKind(g.key)}>
                  <Text style={[styles.segText, active && styles.segTextActive]}>{t(g.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {goalKind && (
            <View style={[styles.numRow, {marginTop: spacing.md}]}>
              <TextInput
                style={[styles.input, styles.numInput]}
                value={goalValue}
                onChangeText={setGoalValue}
                keyboardType="number-pad"
                maxLength={4}
                placeholder={goalKind === 'minutes' ? '30' : '1'}
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.numSuffix}>
                {t(goalKind === 'minutes' ? 'habits.minutesSuffix' : 'habits.timesSuffix')}
              </Text>
            </View>
          )}
        </View>
      )}

      {mode === 'habit' && (
        <View>
          <Text style={styles.label}>{t('habits.matchers')}</Text>
          <Text style={styles.hint}>{t('habits.matchHint')}</Text>
          <View style={styles.keywordRow}>
            <TextInput
              style={[styles.input, styles.flex1]}
              value={keyword}
              onChangeText={setKeyword}
              placeholder={t('habits.keywordPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              onSubmitEditing={addKeyword}
              blurOnSubmit={false}
              returnKeyType="done"
            />
            {q.length > 0 && <Button label={t('common.add')} variant="secondary" onPress={addKeyword} />}
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggestions}>
              {suggestions.map(o => (
                <TouchableOpacity key={key(o.kind, o.id)} style={styles.suggestion} onPress={() => select(o.kind, o.id)}>
                  <Icon name={KIND_ICON[o.kind]} size={14} color={colors.textMuted} />
                  <Text style={styles.chipText}>{o.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {chosen.length > 0 && (
            <View style={[styles.chipsRow, {marginTop: spacing.md}]}>
              {chosen.map(o => (
                <TouchableOpacity
                  key={key(o.kind, o.id)}
                  style={[styles.suggestion, styles.chipActive]}
                  onPress={() => unselect(key(o.kind, o.id))}>
                  <Icon name={KIND_ICON[o.kind]} size={14} color={colors.primary} />
                  <Text style={styles.chipTextActive}>{o.name}</Text>
                  <Icon name="close" size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <Button label={t('common.save')} onPress={save} disabled={!canSave} loading={saving} />
    </ScrollView>
  );
}
