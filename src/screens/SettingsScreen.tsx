import React, {useEffect, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../store/settingsStore';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import type {TabScreenProps} from '../navigation/navigationTypes';

type Props = TabScreenProps<'Settings'>;

type Section = {
  key: 'InterfaceSettings' | 'TrackingSettings' | 'WorkDetailsSettings' | 'DataSettings' | 'QuickAddSettings' | 'LocationSettings' | 'WidgetSettings';
  titleKey: string;
  subtitleKey: string;
};

const SECTIONS: Section[] = [
  {key: 'InterfaceSettings', titleKey: 'settings.interfaceTitle', subtitleKey: 'settings.interfaceSubtitle'},
  {key: 'WorkDetailsSettings', titleKey: 'settings.workDetailsTitle', subtitleKey: 'settings.workDetailsSubtitle'},
  {key: 'QuickAddSettings', titleKey: 'settings.quickAddTitle', subtitleKey: 'settings.quickAddSubtitle'},
  {key: 'WidgetSettings', titleKey: 'widgets.title', subtitleKey: 'widgets.settingsSubtitle'},
  {key: 'TrackingSettings', titleKey: 'settings.trackingTitle', subtitleKey: 'settings.trackingSubtitle'},
  {key: 'LocationSettings', titleKey: 'location.title', subtitleKey: 'location.settingsSubtitle'},
  {key: 'DataSettings', titleKey: 'settings.dataTitle', subtitleKey: 'settings.dataSubtitle'},
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
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {loaded, load} = useSettingsStore();

  useEffect(() => {
    if (!loaded) { load(); }
  }, [loaded, load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('common.settings')}</Text>
        {SECTIONS.map(s => (
          <TouchableOpacity key={s.key} style={styles.row} onPress={() => navigation.navigate(s.key)}>
            <View>
              <Text style={styles.rowTitle}>{t(s.titleKey)}</Text>
              <Text style={styles.rowSubtitle}>{t(s.subtitleKey)}</Text>
            </View>
            <Text style={styles.rowCaret}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHeader}>{t('settings.app')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('common.version')}</Text>
          <Text style={styles.rowValue}>0.3.82</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
