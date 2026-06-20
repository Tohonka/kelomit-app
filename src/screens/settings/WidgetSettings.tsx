import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useProjectStore} from '../../store/projectStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import ProjectPicker from '../../components/entries/ProjectPicker';
import {
  isWidgetBridgeAvailable,
  nativeGetWidgets,
  nativeSetWidgetConfig,
  type WidgetConfig,
  type WidgetInfo,
} from '../../native/widgetSession';
import type {ActivityType} from '../../types';

const ACTIVITY_TYPES: {type: ActivityType; labelKey: string}[] = [
  {type: 'work', labelKey: 'activity.work'},
  {type: 'personal_work', labelKey: 'activity.personal_work'},
  {type: 'personal', labelKey: 'activity.personal'},
];

const defaultConfig = (): WidgetConfig => ({
  project_id: null,
  activity_type: 'work',
  tags: [],
});

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {paddingBottom: spacing.xxl},
    intro: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    empty: {
      padding: spacing.xl,
      gap: spacing.sm,
    },
    emptyText: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      lineHeight: 22,
    },
    widgetCard: {
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      margin: spacing.lg,
      marginBottom: 0,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    widgetTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.sm,
    },
    activityRow: {flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap'},
    activityBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.bg,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    activityBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    activityLabel: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    activityLabelActive: {color: c.primary, fontWeight: typography.weights.semibold},
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
    saveBtn: {
      marginTop: spacing.md,
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.white,
    },
    saved: {
      textAlign: 'center',
      marginTop: spacing.xs,
      fontSize: typography.sizes.xs,
      color: c.success,
    },
  });

/**
 * Maps each placed home-screen session widget (by appWidgetId) to a project +
 * activity + tag (Iteration 3 Phase 9.2). The widget reads this mapping
 * natively when its Start is tapped.
 */
export default function WidgetSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {projects, loaded: projectsLoaded, load: loadProjects, add: addProject} =
    useProjectStore();

  const [widgets, setWidgets] = useState<WidgetInfo[]>([]);
  const [configs, setConfigs] = useState<Record<number, WidgetConfig>>({});
  const [tagText, setTagText] = useState<Record<number, string>>({});
  const [savedId, setSavedId] = useState<number | null>(null);
  const available = isWidgetBridgeAvailable();

  const refresh = useCallback(async () => {
    const list = await nativeGetWidgets();
    setWidgets(list);
    setConfigs(prev => {
      const next: Record<number, WidgetConfig> = {};
      for (const w of list) {
        next[w.appWidgetId] = prev[w.appWidgetId] ?? w.config ?? defaultConfig();
      }
      return next;
    });
    setTagText(prev => {
      const next: Record<number, string> = {};
      for (const w of list) {
        next[w.appWidgetId] = prev[w.appWidgetId] ?? (w.config?.tags ?? []).join(', ');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!projectsLoaded) { loadProjects(); }
    if (available) { refresh().catch(() => {}); }
  }, [projectsLoaded, loadProjects, available, refresh]);

  const update = (id: number, patch: Partial<WidgetConfig>) =>
    setConfigs(prev => ({...prev, [id]: {...prev[id], ...patch}}));

  const handleSave = async (id: number) => {
    const cfg = configs[id] ?? defaultConfig();
    const tags = (tagText[id] ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const toSave: WidgetConfig = {...cfg, tags};
    await nativeSetWidgetConfig(id, toSave);
    update(id, {tags});
    setSavedId(id);
    setTimeout(() => setSavedId(s => (s === id ? null : s)), 1500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('widgets.intro')}</Text>

        {(!available || widgets.length === 0) && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {available ? t('widgets.none') : t('widgets.unavailable')}
            </Text>
          </View>
        )}

        {widgets.map(w => {
          const cfg = configs[w.appWidgetId] ?? defaultConfig();
          return (
            <View key={w.appWidgetId} style={styles.widgetCard}>
              <Text style={styles.widgetTitle}>
                {t(w.type === 'full' ? 'widgets.typeFull' : 'widgets.typeToggle')}
              </Text>

              <Text style={styles.label}>{t('entries.activity')}</Text>
              <View style={styles.activityRow}>
                {ACTIVITY_TYPES.map(({type, labelKey}) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.activityBtn, cfg.activity_type === type && styles.activityBtnActive]}
                    onPress={() => update(w.appWidgetId, {activity_type: type})}>
                    <Text
                      style={[
                        styles.activityLabel,
                        cfg.activity_type === type && styles.activityLabelActive,
                      ]}>
                      {t(labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>{t('entries.projectOptional')}</Text>
              <ProjectPicker
                projects={projects}
                selectedProjectId={cfg.project_id}
                onSelect={id => update(w.appWidgetId, {project_id: id})}
                onCreate={addProject}
              />

              <Text style={styles.label}>{t('entries.tags')}</Text>
              <TextInput
                style={styles.input}
                value={tagText[w.appWidgetId] ?? ''}
                onChangeText={txt => setTagText(prev => ({...prev, [w.appWidgetId]: txt}))}
                placeholder={t('widgets.tagPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />

              <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(w.appWidgetId)}>
                <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              </TouchableOpacity>
              {savedId === w.appWidgetId && (
                <Text style={styles.saved}>{t('widgets.saved')}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
