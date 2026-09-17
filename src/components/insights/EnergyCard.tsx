import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Sheet from '../ui/Sheet';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {EnergyDayRow, EnergyRange} from '../../services/energy';

interface Props {
  energy: EnergyRange | null;
  /** The day to show; absent from `energy.days` = a future date, renders nothing. */
  date: string;
  isToday: boolean;
  onOpenProfile: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      marginTop: spacing.md,
      marginHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    cell: {flex: 1, alignItems: 'center', gap: 2},
    value: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.textPrimary},
    label: {fontSize: typography.sizes.xs, color: c.textMuted},
    hint: {flex: 1, textAlign: 'center', paddingHorizontal: spacing.md, fontSize: typography.sizes.sm, color: c.textMuted},
    body: {paddingHorizontal: spacing.lg, gap: spacing.xs},
    row: {flexDirection: 'row', alignItems: 'center', minHeight: 30},
    rowLabel: {flex: 1, fontSize: typography.sizes.sm, color: c.textPrimary},
    rowMid: {width: 96, textAlign: 'right', fontSize: typography.sizes.xs, color: c.textMuted},
    rowKcal: {width: 64, textAlign: 'right', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.textSecondary},
    total: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, marginTop: spacing.xs, paddingTop: spacing.xs},
    note: {marginTop: spacing.sm, fontSize: typography.sizes.xs, color: c.textMuted, lineHeight: 16},
  });

function hm(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** BMR · used · eaten for one day. Numbers only — no goal, no bar, no colour
 *  verdict. Tap for the factorial breakdown. */
export default function EnergyCard({energy, date, isToday, onOpenProfile}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  if (!energy) { return null; }
  if (energy.bmr == null) {
    return (
      <TouchableOpacity style={styles.card} onPress={onOpenProfile}>
        <Text style={styles.hint}>
          {t('energy.needsProfile', {fields: energy.missing.map(f => t(`energy.field.${f}`)).join(', ')})}
        </Text>
      </TouchableOpacity>
    );
  }
  const row: EnergyDayRow | undefined = energy.days.find(d => d.date === date);
  if (!row) { return null; }

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={() => setOpen(true)} accessibilityLabel={t('energy.title')}>
        <View style={styles.cell}>
          <Text style={styles.value}>{energy.bmr}</Text>
          <Text style={styles.label}>{t('energy.bmr')}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.value}>≈ {row.totalKcal}</Text>
          <Text style={styles.label}>{isToday ? t('energy.usedSoFar') : t('energy.used')}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.value}>{row.eatenKcal ?? '–'}</Text>
          <Text style={styles.label}>{t('energy.eaten')}</Text>
        </View>
      </TouchableOpacity>

      <Sheet visible={open} title={t('energy.title')} onClose={() => setOpen(false)}>
        <View style={styles.body}>
          {row.buckets.map(b => (
            <View key={b.key} style={styles.row}>
              <Text style={styles.rowLabel}>
                {t(`energy.bucket.${b.key}`)}{b.assumed ? ` (${t('energy.assumed')})` : ''}
              </Text>
              <Text style={styles.rowMid}>{hm(b.minutes)} × {b.par.toFixed(1)}</Text>
              <Text style={styles.rowKcal}>{b.kcal}</Text>
            </View>
          ))}
          <View style={[styles.row, styles.total]}>
            <Text style={styles.rowLabel}>{t('energy.total')}</Text>
            <Text style={styles.rowMid}>PAL {row.pal.toFixed(2)}</Text>
            <Text style={styles.rowKcal}>≈ {row.totalKcal}</Text>
          </View>
          {row.hcTotalKcal != null && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('energy.healthConnectSays')}</Text>
              <Text style={styles.rowKcal}>{row.hcTotalKcal}</Text>
            </View>
          )}
          <Text style={styles.note}>{t('energy.note', {bmr: energy.bmr})}</Text>
        </View>
      </Sheet>
    </>
  );
}
