import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, Pressable, StyleSheet, Modal} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useDayStore} from '../store/dayStore';
import {buildQuickAddActions} from '../components/entries/quickAddActions';
import {useTheme, typography, radius, spacing} from '../theme';
import type {Colors} from '../theme';
import type {EntryType} from '../types';
import type {RootStackParamList} from './navigationTypes';

// Center button of the floaty pill. Tap = full new-entry editor (AddEntryModal);
// long-press = the quick-add speed dial (note / photo / video / voice → QuickAddModal).
// Both target today's day, so it works from any tab.
const SIZE = 54;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    button: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{translateY: -10}],
      shadowColor: c.primary,
      shadowOpacity: 0.55,
      shadowOffset: {width: 0, height: 4},
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 6,
      borderColor: c.glassPill,
    },
    overlay: {flex: 1, justifyContent: 'flex-end', alignItems: 'center'},
    backdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000B3'},
    dial: {alignItems: 'center', gap: spacing.md, paddingBottom: 120},
    row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    labelPill: {
      backgroundColor: c.bgCard,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    labelText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    actionBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
  });

// `target` aims quick-add at a specific day (the day-detail screen passes the
// viewed day); without it, quick-add targets today.
export default function QuickAddButton({target}: {target?: {date: string; dayId: number}}) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const today = useDayStore(s => s.today);
  const loadToday = useDayStore(s => s.loadToday);
  const [open, setOpen] = useState(false);

  // Guarantee today's day exists so quick-add works from any tab, not just Home.
  useEffect(() => {
    if (!target && !today) { loadToday(); }
  }, [target, today, loadToday]);

  const resolveDay = React.useCallback(
    () => (target ? {dayId: target.dayId, date: target.date} : {dayId: useDayStore.getState().today?.id, date: undefined as string | undefined}),
    [target],
  );

  const go = React.useCallback(
    (entryType: EntryType) => {
      setOpen(false);
      const {dayId, date} = resolveDay();
      if (dayId == null) { return; }
      navigation.navigate('QuickAddModal', {dayId, date, entryType});
    },
    [navigation, resolveDay],
  );
  // Single tap = the full new-entry editor.
  const openAdd = React.useCallback(() => {
    const {dayId, date} = resolveDay();
    if (dayId == null) { return; }
    navigation.navigate('AddEntryModal', {dayId, date});
  }, [navigation, resolveDay]);
  const actions = useMemo(() => buildQuickAddActions(go), [go]);

  return (
    <>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.dial} pointerEvents="box-none">
            {actions.map((a, i) => (
              <Animated.View key={a.key} entering={FadeInDown.delay(i * 40).springify()} style={styles.row}>
                <View style={styles.labelPill}>
                  <Text style={styles.labelText}>{a.label}</Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
                  <Icon name={a.icon} size={24} color={colors.primary} />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>
      </Modal>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.85}
        accessibilityRole="button"
        onPress={() => (open ? setOpen(false) : openAdd())}
        onLongPress={() => setOpen(true)}
        delayLongPress={250}>
        <Icon name={open ? 'close' : 'plus'} size={26} color={colors.white} />
      </TouchableOpacity>
    </>
  );
}
