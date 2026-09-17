import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {format} from 'date-fns';
import {useShellPadding} from '../navigation/shellMetrics';
import {getInsightsBreakdown, getWorkSecondsByDay, type InsightsData, type InsightSlice, type InsightsScope} from '../db/entries';
import {getSegmentsInRange} from '../db/routeHistory';
import {getFoodKcalByDay, type FoodDayTotals} from '../db/food';
import {getHealthDailyRange} from '../db/health';
import {loadEnergyRange, type EnergyRange} from '../services/energy';
import {findPatterns, usableDays, MIN_DAYS, type DayPoint, type SeriesKey} from '../utils/patterns';
import {useSettingsStore} from '../store/settingsStore';
import {useHabitStore, effectiveDone} from '../store/habitStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {getDateFnsLocale} from '../i18n';
import {formatHours} from '../utils/hoursUtils';
import {datesBetween, formatDuration, shiftDate, todayDate} from '../utils/dateUtils';
import {summarizeSegments, type MovementSummary} from '../utils/movementSummary';
import {movementKcal} from '../utils/energy';
import TargetRing from '../components/insights/TargetRing';
import DayBars, {type DayBar} from '../components/insights/DayBars';
import type {DayRouteSegment, HealthDaily} from '../types';

/*
 * Balance (plan 2026-09-14 B1): the work-hours view grown into one picture of
 * the period — Work / Movement / Habits / Food / Health. It shows, it never
 * grades: no scores, no calorie targets, no streak shaming.
 */

type Period = 'week' | 'month' | 'last30';

const DAY_CEILING_HOURS = 9; // tallest daily bar

const PERIODS: {key: Period; labelKey: string}[] = [
  {key: 'week', labelKey: 'insights.thisWeek'},
  {key: 'month', labelKey: 'insights.thisMonth'},
  {key: 'last30', labelKey: 'insights.last30'},
];

const SCOPES: {key: InsightsScope; labelKey: string}[] = [
  {key: 'all', labelKey: 'insights.scopeAll'},
  {key: 'work', labelKey: 'insights.scopeWork'},
  {key: 'personal', labelKey: 'insights.scopePersonal'},
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(now: Date): Date {
  const m = new Date(now);
  m.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}
function rangeFor(period: Period): {start: string; end: string} {
  const now = new Date();
  const end = localDateStr(now);
  if (period === 'week') {
    return {start: localDateStr(mondayOf(now)), end};
  }
  if (period === 'month') {
    return {start: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end};
  }
  const back = new Date(now);
  back.setDate(now.getDate() - 29);
  return {start: localDateStr(back), end};
}
function km(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

const PATTERN_DAYS = 90;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {},
    segRow: {flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md},
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
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: 22,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    ringCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.xl},
    ringPct: {fontSize: 22, fontWeight: typography.weights.black, color: c.textPrimary},
    ringPctSub: {fontSize: 10, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1},
    ringLabel: {fontSize: typography.sizes.sm, color: c.textMuted},
    ringTotal: {fontSize: 22, fontWeight: typography.weights.bold, color: c.textPrimary, marginTop: 2},
    ringTarget: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 4},
    eyebrow: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginHorizontal: spacing.lg + 4,
      marginTop: spacing.xl,
      marginBottom: spacing.xs,
    },
    sectionTitle: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.black,
      color: c.textPrimary,
      marginHorizontal: spacing.lg + 4,
      marginTop: spacing.xxl,
    },
    barsCard: {
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: 14,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    barCol: {alignItems: 'center', flex: 1, gap: 6},
    barTrack: {height: 100, justifyContent: 'flex-end', width: 22},
    bar: {width: '100%', borderRadius: 5, minHeight: 4},
    barLabel: {fontSize: 11, color: c.textMuted},
    barLabelToday: {color: c.primary, fontWeight: typography.weights.bold},
    // Breakdown + stat rows
    breakRow: {marginBottom: 14},
    breakTop: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
    breakLabel: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.semibold, flex: 1},
    breakValue: {fontSize: typography.sizes.sm, color: c.textSecondary},
    breakTrack: {height: 8, borderRadius: 4, backgroundColor: c.bgMuted, overflow: 'hidden'},
    breakFill: {height: 8, borderRadius: 4},
    statRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6},
    statLabel: {fontSize: typography.sizes.sm, color: c.textSecondary},
    statValue: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.semibold},
    statNote: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: spacing.sm},
    pattern: {fontSize: typography.sizes.sm, color: c.textPrimary, lineHeight: 20, marginBottom: spacing.sm},
    empty: {padding: spacing.xxl, alignItems: 'center'},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
    loader: {marginTop: spacing.xxl},
    flex1: {flex: 1},
  });

type Styles = ReturnType<typeof makeStyles>;

function Breakdown({
  title,
  slices,
  total,
  colorFor,
  styles,
}: {
  title: string;
  slices: InsightSlice[];
  total: number;
  colorFor: (slice: InsightSlice, i: number) => string;
  styles: Styles;
}) {
  if (slices.length === 0) {
    return null;
  }
  return (
    <>
      <Text style={styles.eyebrow}>{title}</Text>
      <View style={styles.card}>
        {slices.map((s, i) => {
          const pct = total > 0 ? Math.round((s.seconds / total) * 100) : 0;
          return (
            <View key={s.key} style={i === slices.length - 1 ? undefined : styles.breakRow}>
              <View style={styles.breakTop}>
                <Text style={styles.breakLabel} numberOfLines={1}>{s.label}</Text>
                <Text style={styles.breakValue}>{formatHours(s.seconds)} · {pct}%</Text>
              </View>
              <View style={styles.breakTrack}>
                <View style={[styles.breakFill, {width: `${Math.max(3, pct)}%`, backgroundColor: colorFor(s, i)}]} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function Stat({label, value, styles}: {label: string; value: string; styles: Styles}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const weeklyTargetHours = useSettingsStore(s => s.weekly_target_hours);
  const bodyWeightKg = useSettingsStore(s => s.body_weight_kg);
  const loadHabits = useHabitStore(s => s.load);
  const habitState = useHabitStore();
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<InsightsScope>('all');
  const [data, setData] = useState<InsightsData | null>(null);
  const [byDay, setByDay] = useState<Record<string, number>>({});
  const [segments, setSegments] = useState<Array<{date: string; segment: DayRouteSegment}>>([]);
  const [foodByDay, setFoodByDay] = useState<Record<string, FoodDayTotals>>({});
  const [health, setHealth] = useState<HealthDaily[]>([]);
  const [energy, setEnergy] = useState<EnergyRange | null>(null);
  const [patternRaw, setPatternRaw] = useState<DayPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(period), [period]);
  const dates = useMemo(() => datesBetween(range.start, range.end), [range]);

  useFocusEffect(useCallback(() => { loadHabits().catch(() => {}); }, [loadHabits]));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const {start, end} = range;
    Promise.all([
      getInsightsBreakdown(start, end, scope),
      getWorkSecondsByDay(start, end),
      getSegmentsInRange(start, end).catch(() => []),
      getFoodKcalByDay(start, end).catch(() => ({})),
      getHealthDailyRange(start, end).catch(() => []),
      loadEnergyRange(start, end).catch(() => null),
    ])
      .then(([d, day, segs, food, hc, en]) => {
        if (cancelled) { return; }
        setData(d);
        setByDay(day);
        setSegments(segs);
        setFoodByDay(food);
        setHealth(hc);
        setEnergy(en);
      })
      .finally(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [range, scope]);

  // Patterns look at the last 90 finished days whatever period is selected.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const end = shiftDate(todayDate(), -1);
    const start = shiftDate(end, -(PATTERN_DAYS - 1));
    Promise.all([
      getHealthDailyRange(start, end).catch((): HealthDaily[] => []),
      getFoodKcalByDay(start, end).catch((): Record<string, FoodDayTotals> => ({})),
      getWorkSecondsByDay(start, end).catch((): Record<string, number> => ({})),
    ]).then(([hcRows, foodRows, workRows]) => {
      if (cancelled) { return; }
      const hcByDate = new Map(hcRows.map(h => [h.date, h]));
      setPatternRaw(datesBetween(start, end).map(date => {
        const h = hcByDate.get(date);
        const f = foodRows[date];
        return {
          date,
          sleep: h?.sleep_minutes ?? null,
          steps: h?.steps ?? null,
          exercise: h?.exercise ? h.exercise.reduce((s, b) => s + b.minutes, 0) : null,
          // a day with any kcal-less entry would read as a light day — skip it
          kcal: f && f.noKcal === 0 ? f.kcal : null,
          work: workRows[date] ? workRows[date] / 3600 : null,
        };
      }));
    });
    return () => { cancelled = true; };
  }, []));

  const patternPoints = useMemo(() => {
    const ids = habitState.habits.filter(h => !h.archived).map(h => h.id);
    if (ids.length === 0) { return patternRaw; }
    return patternRaw.map(p => ({
      ...p,
      habits: (ids.filter(id => effectiveDone(habitState, id, p.date)).length / ids.length) * 100,
    }));
  }, [patternRaw, habitState]);
  const patterns = useMemo(() => findPatterns(patternPoints), [patternPoints]);
  const patternDays = useMemo(() => usableDays(patternPoints), [patternPoints]);

  const fmtSeries = (key: SeriesKey, v: number): string => {
    switch (key) {
      case 'sleep': return `${Math.floor(v / 60)} h ${String(Math.round(v % 60)).padStart(2, '0')}`;
      case 'steps': return String(Math.round(v / 100) * 100);
      case 'exercise': return `${Math.round(v)} min`;
      case 'kcal': return `${Math.round(v / 10) * 10} kcal`;
      case 'work': return `${v.toFixed(1)} h`;
      case 'habits': return `${Math.round(v)} %`;
    }
  };

  const workedSecs = useMemo(() => Object.values(byDay).reduce((s, v) => s + v, 0), [byDay]);
  const showWorked = scope !== 'personal' && workedSecs > 0;
  const hasWork = !!data && (data.totalSeconds > 0 || showWorked);

  // ── Movement ────────────────────────────────────────────────────────────
  const movement: MovementSummary = useMemo(
    () => summarizeSegments(segments.map(s => s.segment)),
    [segments],
  );
  const footSecByDate = useMemo(() => {
    const byDate: Record<string, DayRouteSegment[]> = {};
    for (const s of segments) { (byDate[s.date] ??= []).push(s.segment); }
    const out: Record<string, number> = {};
    for (const [date, segs] of Object.entries(byDate)) { out[date] = summarizeSegments(segs).footSec; }
    return out;
  }, [segments]);
  const hasMovement = movement.footSec + movement.cycleSec + movement.vehicleSec > 0;
  const weightKg = [...health].reverse().find(h => h.weight_kg != null)?.weight_kg ?? bodyWeightKg;
  const estKcal = weightKg != null && (movement.footSec > 0 || movement.cycleSec > 0)
    ? movementKcal(movement, weightKg)
    : null;

  // ── Habits: days in the period where any habit of the group was done ────
  const habitRows = useMemo(() => {
    return habitState.categories
      .map(cat => {
        const ids = habitState.habits.filter(h => h.category_id === cat.id).map(h => h.id);
        if (ids.length === 0) { return null; }
        const done = dates.filter(d => ids.some(id => effectiveDone(habitState, id, d))).length;
        return {id: cat.id, title: cat.title, done};
      })
      .filter((r): r is {id: number; title: string; done: number} => r != null);
  }, [habitState, dates]);
  const hasHabits = habitRows.length > 0;

  // ── Energy: finished days only, so today's partial figure doesn't drag the average ──
  const energyStats = useMemo(() => {
    const today = todayDate();
    const days = (energy?.days ?? []).filter(d => d.date < today);
    if (days.length === 0) { return null; }
    const used = days.reduce((s, d) => s + d.totalKcal, 0);
    const fed = days.filter(d => d.eatenKcal != null);
    const eaten = fed.reduce((s, d) => s + (d.eatenKcal ?? 0), 0);
    return {
      used,
      usedAvg: Math.round(used / days.length / 10) * 10,
      eaten,
      eatenAvg: fed.length > 0 ? Math.round(eaten / fed.length / 10) * 10 : 0,
      eatenDays: fed.length,
    };
  }, [energy]);

  // ── Food ────────────────────────────────────────────────────────────────
  const food = useMemo(() => {
    const days = Object.values(foodByDay);
    const kcal = days.reduce((s, d) => s + d.kcal, 0);
    const entries = days.reduce((s, d) => s + d.entries, 0);
    const noKcal = days.reduce((s, d) => s + d.noKcal, 0);
    return {kcal, entries, noKcal, days: days.length};
  }, [foodByDay]);
  const hasFood = food.entries > 0;

  // ── Health ──────────────────────────────────────────────────────────────
  const hc = useMemo(() => {
    const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
    const steps = avg(health.map(h => h.steps).filter((v): v is number => v != null));
    const sleep = avg(health.map(h => h.sleep_minutes).filter((v): v is number => v != null));
    const hr = avg(health.map(h => h.resting_hr).filter((v): v is number => v != null));
    const weights = health.map(h => h.weight_kg).filter((v): v is number => v != null);
    return {
      steps: steps != null ? Math.round(steps) : null,
      sleep: sleep != null ? Math.round(sleep) : null,
      hr: hr != null ? Math.round(hr) : null,
      weightFrom: weights[0] ?? null,
      weightTo: weights[weights.length - 1] ?? null,
    };
  }, [health]);
  const hasHealth = hc.steps != null || hc.sleep != null || hc.weightTo != null || hc.hr != null;

  const hasAnything = hasWork || hasMovement || hasHabits || hasFood || hasHealth;

  const accentFor = (slice: InsightSlice): string => {
    if (slice.key === 'work') { return colors.accentPink; }
    if (slice.key === 'personal_work') { return colors.accentAmber; }
    if (slice.key === 'personal') { return colors.accentCyan; }
    return colors.accentPink;
  };
  const cycle = [colors.accentPink, colors.accentCyan, colors.accentAmber];

  // Week view: Mon–Sun columns shared by every daily bar chart.
  const weekDays = useMemo(() => {
    const monday = mondayOf(new Date());
    const today = localDateStr(new Date());
    const locale = getDateFnsLocale(i18n.resolvedLanguage === 'fi' ? 'fi' : 'en');
    return Array.from({length: 7}, (_v, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = localDateStr(d);
      return {key, label: format(d, 'EEEEEE', {locale}), secs: byDay[key] ?? 0, isToday: key === today};
    });
  }, [byDay, i18n.resolvedLanguage]);
  const weekBars = (valueOf: (key: string) => number): DayBar[] =>
    weekDays.map(d => ({key: d.key, label: d.label, value: valueOf(d.key), isToday: d.isToday}));

  const targetSecs = weeklyTargetHours * 3600;
  const targetPct = targetSecs > 0 ? Math.min(1, workedSecs / targetSecs) : 0;
  const isWeek = period === 'week';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {paddingTop: shellPad.paddingTop, paddingBottom: shellPad.paddingBottom},
        ]}>
        <View style={styles.segRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.seg, period === p.key && styles.segActive]}
              onPress={() => setPeriod(p.key)}>
              <Text style={[styles.segText, period === p.key && styles.segTextActive]}>{t(p.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.segRow}>
          {SCOPES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.seg, scope === s.key && styles.segActive]}
              onPress={() => setScope(s.key)}>
              <Text style={[styles.segText, scope === s.key && styles.segTextActive]}>{t(s.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator style={styles.loader} color={colors.primary} />}

        {!loading && !hasAnything && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('balance.empty')}</Text>
          </View>
        )}

        {!loading && hasWork && (
          <>
            <Text style={styles.sectionTitle}>{t('balance.work')}</Text>
            {isWeek && scope !== 'personal' && (
              <>
                <View style={[styles.card, styles.ringCard]}>
                  <TargetRing pct={targetPct} color={colors.primary} track={colors.bgMuted} innerBg={colors.bgCard}>
                    <Text style={styles.ringPct}>{Math.round(targetPct * 100)}%</Text>
                    <Text style={styles.ringPctSub}>{t('insights.ofTarget')}</Text>
                  </TargetRing>
                  <View style={styles.flex1}>
                    <Text style={styles.ringLabel}>{t('insights.trackedThisWeek')}</Text>
                    <Text style={styles.ringTotal}>{formatHours(workedSecs)}</Text>
                    <Text style={styles.ringTarget}>
                      {t('insights.ofTargetHours', {target: `${weeklyTargetHours}h`})}
                    </Text>
                  </View>
                </View>

                <Text style={styles.eyebrow}>{t('insights.dailyHours')}</Text>
                <View style={styles.barsCard}>
                  {weekDays.map(d => {
                    const h = d.secs / 3600;
                    const heightPx = Math.max(d.secs > 0 ? 4 : 0, Math.min(1, h / DAY_CEILING_HOURS) * 100);
                    return (
                      <View key={d.key} style={styles.barCol}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.bar,
                              {height: heightPx, backgroundColor: d.secs > 0 ? colors.primary : colors.bgMuted},
                            ]}
                          />
                        </View>
                        <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {!isWeek && showWorked && (
              <View style={[styles.card, styles.ringCard]}>
                <TargetRing
                  pct={data!.totalSeconds > 0 ? Math.min(1, data!.totalSeconds / workedSecs) : 0}
                  color={colors.primary}
                  track={colors.bgMuted}
                  innerBg={colors.bgCard}>
                  <Text style={styles.ringPct}>{formatHours(workedSecs)}</Text>
                  <Text style={styles.ringPctSub}>{t('insights.scopeWork')}</Text>
                </TargetRing>
                <View style={styles.flex1}>
                  <Text style={styles.ringLabel}>{t('insights.totalTracked')}</Text>
                  <Text style={styles.ringTotal}>{formatHours(data!.totalSeconds)}</Text>
                  <Text style={styles.ringTarget}>{t('insights.outOfWorkHours', {worked: formatHours(workedSecs)})}</Text>
                </View>
              </View>
            )}

            <Breakdown
              title={t('insights.byActivity')}
              slices={data!.byActivity}
              total={data!.totalSeconds}
              colorFor={accentFor}
              styles={styles}
            />
            <Breakdown
              title={t('insights.byProject')}
              slices={data!.byProject}
              total={data!.totalSeconds}
              colorFor={(_s, i) => cycle[i % cycle.length]}
              styles={styles}
            />
            <Breakdown
              title={t('insights.byTag')}
              slices={data!.byTag}
              total={data!.totalSeconds}
              colorFor={(_s, i) => cycle[i % cycle.length]}
              styles={styles}
            />
          </>
        )}

        {!loading && hasMovement && (
          <>
            <Text style={styles.sectionTitle}>{t('balance.movement')}</Text>
            <View style={styles.card}>
              {movement.footSec > 0 && (
                <Stat label={t('balance.walking')} value={`${formatDuration(movement.footSec)} · ${km(movement.footM)}`} styles={styles} />
              )}
              {movement.cycleSec > 0 && (
                <Stat label={t('balance.cycling')} value={`${formatDuration(movement.cycleSec)} · ${km(movement.cycleM)}`} styles={styles} />
              )}
              {movement.vehicleSec > 0 && (
                <Stat label={t('balance.driving')} value={`${formatDuration(movement.vehicleSec)} · ${km(movement.vehicleM)}`} styles={styles} />
              )}
              {movement.stillSec > 0 && (
                <Stat label={t('balance.still')} value={formatDuration(movement.stillSec)} styles={styles} />
              )}
              <Text style={styles.statNote}>
                {estKcal != null ? t('balance.energyEstimate', {kcal: estKcal}) : t('balance.energyNeedsWeight')}
              </Text>
            </View>
            {isWeek && (
              <>
                <Text style={styles.eyebrow}>{t('balance.walkingMinutes')}</Text>
                <DayBars days={weekBars(k => Math.round((footSecByDate[k] ?? 0) / 60))} color={colors.accentCyan} />
              </>
            )}
          </>
        )}

        {!loading && hasHabits && (
          <>
            <Text style={styles.sectionTitle}>{t('balance.habits')}</Text>
            <View style={styles.card}>
              {habitRows.map((r, i) => {
                const pct = dates.length > 0 ? Math.round((r.done / dates.length) * 100) : 0;
                return (
                  <View key={r.id} style={i === habitRows.length - 1 ? undefined : styles.breakRow}>
                    <View style={styles.breakTop}>
                      <Text style={styles.breakLabel} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.breakValue}>{t('balance.habitDays', {done: r.done, total: dates.length})}</Text>
                    </View>
                    <View style={styles.breakTrack}>
                      <View style={[styles.breakFill, {width: `${Math.max(3, pct)}%`, backgroundColor: cycle[i % cycle.length]}]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {!loading && hasFood && (
          <>
            <Text style={styles.sectionTitle}>{t('balance.food')}</Text>
            <View style={styles.card}>
              <Stat label={t('balance.foodTotal', {kcal: food.kcal, n: food.entries})} value="" styles={styles} />
              <Stat
                label={t('balance.foodAvg', {kcal: food.days > 0 ? Math.round(food.kcal / food.days) : 0, days: food.days})}
                value=""
                styles={styles}
              />
              {food.noKcal > 0 && <Text style={styles.statNote}>{t('balance.foodNoKcal', {n: food.noKcal})}</Text>}
            </View>
            {isWeek && (
              <>
                <Text style={styles.eyebrow}>{t('balance.dailyKcal')}</Text>
                <DayBars days={weekBars(k => foodByDay[k]?.kcal ?? 0)} color={colors.accentAmber} />
              </>
            )}
          </>
        )}

        {!loading && energy?.bmr != null && energyStats && (
          <>
            <Text style={styles.sectionTitle}>{t('energy.title')}</Text>
            <View style={styles.card}>
              <Stat label={t('energy.bmr')} value={t('energy.kcalPerDay', {kcal: energy.bmr})} styles={styles} />
              <Stat
                label={t('energy.used')}
                value={t('energy.totalAndAvg', {total: energyStats.used, avg: energyStats.usedAvg})}
                styles={styles}
              />
              {energyStats.eatenDays > 0 && (
                <Stat
                  label={t('energy.eatenOnDays', {days: energyStats.eatenDays})}
                  value={t('energy.totalAndAvg', {total: energyStats.eaten, avg: energyStats.eatenAvg})}
                  styles={styles}
                />
              )}
              <Text style={styles.statNote}>{t('energy.estimateNote')}</Text>
            </View>
            {isWeek && (
              <>
                <Text style={styles.eyebrow}>{t('energy.dailyUsed')}</Text>
                <DayBars
                  days={weekBars(k => energy.days.find(d => d.date === k)?.totalKcal ?? 0)}
                  color={colors.accentCyan}
                />
              </>
            )}
          </>
        )}

        {!loading && hasHealth && (
          <>
            <Text style={styles.sectionTitle}>{t('balance.health')}</Text>
            <View style={styles.card}>
              {hc.steps != null && (
                <Stat label={t('balance.steps')} value={t('balance.perDay', {n: hc.steps})} styles={styles} />
              )}
              {hc.sleep != null && (
                <Stat
                  label={t('balance.sleep')}
                  value={t('balance.sleepAvg', {h: Math.floor(hc.sleep / 60), m: hc.sleep % 60})}
                  styles={styles}
                />
              )}
              {hc.weightTo != null && (
                <Stat
                  label={t('balance.weight')}
                  value={t('balance.weightTrend', {from: (hc.weightFrom ?? hc.weightTo).toFixed(1), to: hc.weightTo.toFixed(1)})}
                  styles={styles}
                />
              )}
              {hc.hr != null && (
                <Stat label={t('balance.restingHr')} value={t('balance.bpm', {n: hc.hr})} styles={styles} />
              )}
            </View>
            {isWeek && hc.steps != null && (
              <>
                <Text style={styles.eyebrow}>{t('balance.dailySteps')}</Text>
                <DayBars
                  days={weekBars(k => health.find(h => h.date === k)?.steps ?? 0)}
                  color={colors.accentPink}
                />
              </>
            )}
          </>
        )}

        {!loading && patternDays > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('patterns.title')}</Text>
            <View style={styles.card}>
              {patterns.length === 0 ? (
                <Text style={styles.statNote}>
                  {patternDays < MIN_DAYS * 2
                    ? t('patterns.needMore', {have: patternDays, need: MIN_DAYS * 2})
                    : t('patterns.none')}
                </Text>
              ) : (
                <>
                  {patterns.map(p => (
                    <Text key={`${p.x}-${p.y}`} style={styles.pattern}>
                      {t(p.lag === 1 ? 'patterns.sentenceNext' : 'patterns.sentence', {
                        x: t(`patterns.series.${p.x}`),
                        y: t(`patterns.series.${p.y}`),
                        threshold: fmtSeries(p.x, p.threshold),
                        low: fmtSeries(p.y, p.lowMean),
                        high: fmtSeries(p.y, p.highMean),
                      })}
                    </Text>
                  ))}
                  <Text style={styles.statNote}>{t('patterns.note', {days: PATTERN_DAYS})}</Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
