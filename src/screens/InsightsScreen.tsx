import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import {format} from 'date-fns';
import {useShellPadding} from '../navigation/shellMetrics';
import {getInsightsBreakdown, getWorkSecondsByDay, type InsightsData, type InsightSlice, type InsightsScope} from '../db/entries';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {getDateFnsLocale} from '../i18n';
import {formatHours} from '../utils/hoursUtils';
import TargetRing from '../components/insights/TargetRing';

type Period = 'week' | 'month' | 'last30';

// Weekly worked-hours goal the target ring measures against. Tweakable knob —
// promote to a setting when the "work details" screen grows one.
const WEEKLY_TARGET_HOURS = 40;
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
    // Breakdown
    breakRow: {marginBottom: 14},
    breakTop: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6},
    breakLabel: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.semibold, flex: 1},
    breakValue: {fontSize: typography.sizes.sm, color: c.textSecondary},
    breakTrack: {height: 8, borderRadius: 4, backgroundColor: c.bgMuted, overflow: 'hidden'},
    breakFill: {height: 8, borderRadius: 4},
    empty: {padding: spacing.xxl, alignItems: 'center'},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
    loader: {marginTop: spacing.xxl},
    flex1: {flex: 1},
  });

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
  styles: ReturnType<typeof makeStyles>;
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

export default function InsightsScreen() {
  const {t, i18n} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shellPad = useShellPadding();
  const [period, setPeriod] = useState<Period>('week');
  const [scope, setScope] = useState<InsightsScope>('all');
  const [data, setData] = useState<InsightsData | null>(null);
  const [byDay, setByDay] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const {start, end} = rangeFor(period);
    Promise.all([getInsightsBreakdown(start, end, scope), getWorkSecondsByDay(start, end)])
      .then(([d, day]) => {
        if (cancelled) { return; }
        setData(d);
        setByDay(day);
      })
      .finally(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [period, scope]);

  const workedSecs = useMemo(() => Object.values(byDay).reduce((s, v) => s + v, 0), [byDay]);
  const showWorked = scope !== 'personal' && workedSecs > 0;
  const hasData = data && (data.totalSeconds > 0 || showWorked);

  const accentFor = (slice: InsightSlice): string => {
    if (slice.key === 'work') { return colors.accentPink; }
    if (slice.key === 'personal_work') { return colors.accentAmber; }
    if (slice.key === 'personal') { return colors.accentCyan; }
    return colors.accentPink;
  };
  const cycle = [colors.accentPink, colors.accentCyan, colors.accentAmber];

  // Weekly target ring + daily bars (week view only — they're week concepts).
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

  const targetSecs = WEEKLY_TARGET_HOURS * 3600;
  const targetPct = Math.min(1, workedSecs / targetSecs);

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

        {!loading && !hasData && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('insights.empty')}</Text>
          </View>
        )}

        {!loading && hasData && (
          <>
            {period === 'week' && scope !== 'personal' && (
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
                      {t('insights.ofTargetHours', {target: `${WEEKLY_TARGET_HOURS}h`})}
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

            {period !== 'week' && showWorked && (
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
      </ScrollView>
    </View>
  );
}
