import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {colors, typography, spacing, radius} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Settings'>;

export default function SettingsScreen({navigation}: Props) {
  const {loaded, load, gps_enabled, setGpsEnabled, default_activity_type} =
    useSettingsStore();

  useEffect(() => {
    if (!loaded) {
      load();
    }
  }, [loaded, load]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Tracking</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>GPS tracking</Text>
          <TouchableOpacity
            style={[styles.toggle, gps_enabled && styles.toggleOn]}
            onPress={() => setGpsEnabled(!gps_enabled)}>
            <Text style={[styles.toggleText, gps_enabled && styles.toggleTextOn]}>
              {gps_enabled ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default activity</Text>
          <Text style={styles.rowValue}>{default_activity_type}</Text>
        </View>

        <Text style={styles.sectionHeader}>Data</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('ProjectsScreen')}>
          <Text style={styles.rowLabel}>Projects</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>App</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {paddingBottom: spacing.xxl},
  sectionHeader: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
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
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 52,
  },
  rowLabel: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: typography.sizes.base,
    color: colors.textMuted,
  },
  rowCaret: {
    fontSize: typography.sizes.lg,
    color: colors.textMuted,
  },
  toggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted,
  },
  toggleOn: {
    borderColor: colors.success,
    backgroundColor: colors.success + '15',
  },
  toggleText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
  },
  toggleTextOn: {
    color: colors.success,
  },
});
