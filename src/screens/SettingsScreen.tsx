import React, {useEffect, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Settings'>;

type Section = {
  key: 'InterfaceSettings' | 'TrackingSettings' | 'DataSettings' | 'QuickAddSettings';
  title: string;
  subtitle: string;
};

const SECTIONS: Section[] = [
  {key: 'InterfaceSettings', title: 'Interface', subtitle: 'Theme, week numbers, time entry'},
  {key: 'QuickAddSettings', title: 'Quick add', subtitle: 'Defaults for long-press add'},
  {key: 'TrackingSettings', title: 'Tracking', subtitle: 'GPS, defaults'},
  {key: 'DataSettings', title: 'Data', subtitle: 'Projects, export'},
];

const makeStyles = (c: Colors) =>
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
      minHeight: 60,
    },
    rowTitle: {fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
    rowSubtitle: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    rowCaret: {fontSize: typography.sizes.lg, color: c.textMuted},
    rowValue: {fontSize: typography.sizes.base, color: c.textMuted},
  });

export default function SettingsScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {loaded, load} = useSettingsStore();

  useEffect(() => {
    if (!loaded) { load(); }
  }, [loaded, load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Settings</Text>
        {SECTIONS.map(s => (
          <TouchableOpacity key={s.key} style={styles.row} onPress={() => navigation.navigate(s.key)}>
            <View>
              <Text style={styles.rowTitle}>{s.title}</Text>
              <Text style={styles.rowSubtitle}>{s.subtitle}</Text>
            </View>
            <Text style={styles.rowCaret}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHeader}>App</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Version</Text>
          <Text style={styles.rowValue}>0.2.5</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
