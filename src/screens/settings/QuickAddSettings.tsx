import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {useProjectStore} from '../../store/projectStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {ActivityType} from '../../types';
import {makeSettingsStyles} from './settingsStyles';

const ACTIVITIES: {type: ActivityType; labelKey: string}[] = [
  {type: 'work', labelKey: 'activity.work'},
  {type: 'personal_work', labelKey: 'activity.personal_work'},
  {type: 'personal', labelKey: 'activity.personal'},
];

const makeLocalStyles = (c: Colors) =>
  StyleSheet.create({
    block: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.bgCard, borderBottomWidth: 1, borderBottomColor: c.border},
    blockLabel: {fontSize: typography.sizes.base, color: c.textPrimary, marginBottom: spacing.sm},
    chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    chipText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    chipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    input: {
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
  });

export default function QuickAddSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const local = useMemo(() => makeLocalStyles(colors), [colors]);

  const {
    quickadd_default_activity, setQuickAddDefaultActivity,
    quickadd_default_tag, setQuickAddDefaultTag,
    quickadd_default_project_id, setQuickAddDefaultProjectId,
  } = useSettingsStore();
  const {projects, loaded, load} = useProjectStore();

  const [tagDraft, setTagDraft] = useState(quickadd_default_tag);

  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);
  useEffect(() => { setTagDraft(quickadd_default_tag); }, [quickadd_default_tag]);

  const activeProjects = projects.filter(p => !p.archived);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('settings.quickAddDefaults')}</Text>

        <View style={local.block}>
          <Text style={local.blockLabel}>{t('entries.activity')}</Text>
          <View style={local.chips}>
            {ACTIVITIES.map(({type, labelKey}) => (
              <TouchableOpacity
                key={type}
                style={[local.chip, quickadd_default_activity === type && local.chipActive]}
                onPress={() => setQuickAddDefaultActivity(type)}>
                <Text style={[local.chipText, quickadd_default_activity === type && local.chipTextActive]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={local.block}>
          <Text style={local.blockLabel}>{t('settings.tag')}</Text>
          <TextInput
            style={local.input}
            value={tagDraft}
            onChangeText={setTagDraft}
            onEndEditing={() => setQuickAddDefaultTag(tagDraft.trim())}
            onSubmitEditing={() => setQuickAddDefaultTag(tagDraft.trim())}
            placeholder={t('settings.noTag')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <View style={local.block}>
          <Text style={local.blockLabel}>{t('settings.project')}</Text>
          <View style={local.chips}>
            <TouchableOpacity
              style={[local.chip, quickadd_default_project_id == null && local.chipActive]}
              onPress={() => setQuickAddDefaultProjectId(null)}>
              <Text style={[local.chipText, quickadd_default_project_id == null && local.chipTextActive]}>{t('common.none')}</Text>
            </TouchableOpacity>
            {activeProjects.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[local.chip, quickadd_default_project_id === p.id && local.chipActive]}
                onPress={() => setQuickAddDefaultProjectId(p.id)}>
                <Text style={[local.chipText, quickadd_default_project_id === p.id && local.chipTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
