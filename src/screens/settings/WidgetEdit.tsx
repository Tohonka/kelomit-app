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
  nativeGetWidgets,
  nativeSetWidgetConfig,
  type WidgetConfig,
} from '../../native/widgetSession';
import type {ActivityType} from '../../types';
import type {RootStackScreenProps} from '../../navigation/navigationTypes';

type Props = RootStackScreenProps<'WidgetEdit'>;

const ACTIVITY_TYPES: {type: ActivityType; labelKey: string}[] = [
  {type: 'work', labelKey: 'activity.work'},
  {type: 'personal_work', labelKey: 'activity.personal_work'},
  {type: 'personal', labelKey: 'activity.personal'},
];

const defaultConfig = (): WidgetConfig => ({
  project_id: null,
  activity_type: 'work',
  tags: [],
  name: null,
});

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm},
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
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    activityBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    activityLabel: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    activityLabelActive: {color: c.primary, fontWeight: typography.weights.semibold},
    input: {
      backgroundColor: c.bgCard,
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
 * Edit view for one placed home-screen widget: name, activity, project, tags.
 * Reached from the WidgetSettings list. Later widget features (trigger
 * integrations, conditions) get added here, not to the list.
 */
export default function WidgetEdit({navigation, route}: Props) {
  const {appWidgetId} = route.params;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {projects, loaded: projectsLoaded, load: loadProjects, add: addProject} =
    useProjectStore();

  const [cfg, setCfg] = useState<WidgetConfig>(defaultConfig());
  const [tagText, setTagText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!projectsLoaded) { loadProjects(); }
    nativeGetWidgets()
      .then(list => {
        const w = list.find(x => x.appWidgetId === appWidgetId);
        const config = w?.config ?? defaultConfig();
        setCfg(config);
        setTagText((config.tags ?? []).join(', '));
        navigation.setOptions({
          title:
            config.name?.trim() ||
            t(w?.type === 'toggle' ? 'widgets.typeToggle' : 'widgets.typeFull'),
        });
      })
      .catch(() => {});
  }, [appWidgetId, projectsLoaded, loadProjects, navigation, t]);

  const update = useCallback(
    (patch: Partial<WidgetConfig>) => setCfg(prev => ({...prev, ...patch})),
    [],
  );

  const handleSave = async () => {
    const tags = tagText
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const toSave: WidgetConfig = {...cfg, tags, name: cfg.name?.trim() || null};
    await nativeSetWidgetConfig(appWidgetId, toSave);
    setCfg(toSave);
    setTagText(tags.join(', '));
    if (toSave.name) { navigation.setOptions({title: toSave.name}); }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('widgets.name')}</Text>
        <TextInput
          style={styles.input}
          value={cfg.name ?? ''}
          onChangeText={txt => update({name: txt})}
          placeholder={t('widgets.namePlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={40}
        />

        <Text style={styles.label}>{t('entries.activity')}</Text>
        <View style={styles.activityRow}>
          {ACTIVITY_TYPES.map(({type, labelKey}) => (
            <TouchableOpacity
              key={type}
              style={[styles.activityBtn, cfg.activity_type === type && styles.activityBtnActive]}
              onPress={() => update({activity_type: type})}>
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
          onSelect={id => update({project_id: id})}
          onCreate={addProject}
        />

        <Text style={styles.label}>{t('entries.tags')}</Text>
        <TextInput
          style={styles.input}
          value={tagText}
          onChangeText={setTagText}
          placeholder={t('widgets.tagPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{t('common.save')}</Text>
        </TouchableOpacity>
        {saved && <Text style={styles.saved}>{t('widgets.saved')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
