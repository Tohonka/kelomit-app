import {StyleSheet} from 'react-native';
import {typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

/** Shared row/section/toggle styling used across the Settings subsection screens. */
export const makeSettingsStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {paddingBottom: spacing.xxl},
    sectionHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: c.bgCard,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      minHeight: 52,
    },
    rowLabel: {fontSize: typography.sizes.base, color: c.textPrimary},
    rowSubLabel: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    rowValue: {fontSize: typography.sizes.base, color: c.textMuted},
    rowCaret: {fontSize: typography.sizes.lg, color: c.textMuted},
    toggle: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgMuted,
    },
    toggleOn: {borderColor: c.success, backgroundColor: c.success + '15'},
    toggleText: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
    },
    toggleTextOn: {color: c.success},
    segment: {
      flexDirection: 'row',
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      padding: 3,
      marginLeft: spacing.md,
    },
    segmentBtn: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm},
    segmentBtnActive: {backgroundColor: c.bgCard},
    segmentBtnText: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      fontWeight: typography.weights.medium,
    },
    segmentBtnTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
  });
