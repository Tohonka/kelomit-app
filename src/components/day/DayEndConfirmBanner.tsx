import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {
  getPendingDayEndConfirmation,
  applyDayEndResponse,
  onDayEndChange,
  type PendingDayEnd,
} from '../../db/dayConfirmations';
import {cancelDayEndConfirmation} from '../../services/notificationService';
import {respondToDayEnd} from '../../native/backgroundLocation';
import {reconcileNativeEvents} from '../../services/nativeEventSync';
import {formatTime} from '../../utils/dateUtils';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.primary + '12',
      borderWidth: 1,
      borderColor: c.primary + '40',
      gap: spacing.sm,
    },
    question: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    row: {flexDirection: 'row', gap: spacing.sm},
    btn: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    yes: {backgroundColor: c.primary},
    no: {backgroundColor: c.bgMuted},
    yesText: {color: c.white, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
    noText: {color: c.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold},
  });

/**
 * In-app mirror of the day-end Yes/No notification (Phase 8.2). Shows whenever
 * there's an unanswered confirmation, so the prompt isn't lost if the
 * notification is missed. Reacts to `onDayEndChange` so it appears/disappears
 * immediately.
 */
export default function DayEndConfirmBanner() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pending, setPending] = useState<PendingDayEnd | null>(null);

  const load = useCallback(() => {
    getPendingDayEndConfirmation().then(setPending).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return onDayEndChange(load);
  }, [load]);

  if (!pending) {
    return null;
  }

  const answer = async (confirmed: boolean) => {
    const current = pending;
    setPending(null); // optimistic hide
    try {
      if (current.token) {
        await respondToDayEnd(current.token, confirmed);
        await reconcileNativeEvents();
      } else {
        // Upgrade-only fallback for a prompt created by the retired JS engine.
        await applyDayEndResponse(current.id, current.dayId, current.proposedEnd, confirmed);
        cancelDayEndConfirmation(current.dayId).catch(() => {});
      }
    } finally {
      load();
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{t('dayEnd.question', {time: formatTime(pending.proposedEnd)})}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.yes]} onPress={() => answer(true)}>
          <Text style={styles.yesText}>{t('common.yes')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.no]} onPress={() => answer(false)}>
          <Text style={styles.noText}>{t('common.no')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
