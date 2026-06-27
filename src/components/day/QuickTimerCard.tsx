import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useSessionStore} from '../../store/sessionStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useProjectStore} from '../../store/projectStore';
import {useEntryStore} from '../../store/entryStore';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {elapsedSeconds} from '../../services/sessionLogic';
import {formatTime} from '../../utils/dateUtils';
import {haptic, HAPTIC_START, HAPTIC_SAVE} from '../../utils/haptics';
import ProjectPicker from '../entries/ProjectPicker';
import type {ActivityType} from '../../types';

const ACTIVITY_TYPES: {type: ActivityType; labelKey: string}[] = [
  {type: 'work', labelKey: 'activity.work'},
  {type: 'personal_work', labelKey: 'activity.personal_work'},
  {type: 'personal', labelKey: 'activity.personal'},
];

const pad = (n: number) => String(n).padStart(2, '0');

/** H:MM:SS once past an hour, else M:SS — the live running-session readout. */
function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardRunning: {borderColor: c.primary, backgroundColor: c.primary + '0D'},
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    optionsToggle: {
      fontSize: typography.sizes.sm,
      color: c.primary,
      fontWeight: typography.weights.medium,
    },
    target: {
      fontSize: typography.sizes.sm,
      color: c.textMuted,
      marginTop: 2,
    },
    options: {marginTop: spacing.md, gap: spacing.sm},
    sectionLabel: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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
    startBtn: {
      marginTop: spacing.md,
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    startBtnText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.white,
    },
    // Running state
    clock: {
      fontSize: 44,
      fontWeight: typography.weights.bold,
      color: c.primary,
      fontVariant: ['tabular-nums'],
      marginTop: spacing.sm,
    },
    runningTarget: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    runningStarted: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      marginTop: 2,
    },
    actionRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md},
    stopBtn: {
      flex: 1,
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopBtnText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.white,
    },
    cancelBtn: {
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.medium,
      color: c.textSecondary,
    },
  });

/**
 * In-app quick-set timer (Iteration 3 Phase 9.1). Start tracking with one tap;
 * on stop it logs a `duration_sec` note against the day it started. Shares the
 * session model (`sessionStore` / `sessionService`) that the home-screen widgets
 * will reuse.
 */
export default function QuickTimerCard() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const {active, loaded, load, start, stop, cancel} = useSessionStore();
  const {
    loaded: settingsLoaded,
    quickadd_default_activity,
    quickadd_default_project_id,
    quickadd_default_tag,
  } = useSettingsStore();
  const {projects, loaded: projectsLoaded, load: loadProjects, add: addProject} =
    useProjectStore();
  const {loadEntriesForDay} = useEntryStore();

  const [expanded, setExpanded] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>('work');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  // Re-render once a second while running to advance the live clock.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!loaded) { load(); }
    if (!projectsLoaded) { loadProjects(); }
  }, [loaded, load, projectsLoaded, loadProjects]);

  // Seed the config from the quick-add defaults (only while idle).
  useEffect(() => {
    if (settingsLoaded && !active) {
      setActivityType(quickadd_default_activity);
      setProjectId(quickadd_default_project_id);
    }
  }, [settingsLoaded, active, quickadd_default_activity, quickadd_default_project_id]);

  useEffect(() => {
    if (!active) { return; }
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  const projectName = (id: number | null) =>
    id == null ? null : projects.find(p => p.id === id)?.name ?? null;

  const targetSummary = (id: number | null, activity: ActivityType) => {
    const name = projectName(id) ?? t('common.none');
    return `${t(`activity.${activity}`)} · ${name}`;
  };

  const handleStart = async () => {
    if (busy) { return; }
    setBusy(true);
    try {
      const tag = quickadd_default_tag.trim();
      await start({
        project_id: projectId,
        activity_type: activityType,
        tags: tag ? [tag] : [],
        title,
        source: 'timer',
      });
      haptic(HAPTIC_START);
      setTitle('');
      setExpanded(false);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy) { return; }
    setBusy(true);
    try {
      const result = await stop();
      if (result.dayId != null) {
        await loadEntriesForDay(result.dayId);
      }
      haptic(HAPTIC_SAVE);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(t('timer.cancelConfirmTitle'), t('timer.cancelConfirmMessage'), [
      {text: t('common.no'), style: 'cancel'},
      {
        text: t('timer.cancelTimer'),
        style: 'destructive',
        onPress: () => { cancel().catch(() => {}); },
      },
    ]);
  };

  // ── Running ──────────────────────────────────────────────────────────────
  if (active) {
    const seconds = elapsedSeconds(active.started_at);
    return (
      <View style={[styles.card, styles.cardRunning]}>
        <Text style={styles.title}>{t('timer.tracking')}</Text>
        <Text style={styles.clock}>{formatClock(seconds)}</Text>
        <Text style={styles.runningTarget}>
          {active.title
            ? active.title
            : targetSummary(active.project_id, active.activity_type)}
        </Text>
        <Text style={styles.runningStarted}>
          {t('timer.started', {time: formatTime(active.started_at)})}
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={busy}>
            <Text style={styles.stopBtnText}>{t('timer.stop')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={busy}>
            <Text style={styles.cancelBtnText}>{t('timer.cancelTimer')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('timer.title')}</Text>
        <TouchableOpacity onPress={() => setExpanded(v => !v)}>
          <Text style={styles.optionsToggle}>
            {expanded ? t('common.close') : t('timer.options')}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.target}>{targetSummary(projectId, activityType)}</Text>

      {expanded && (
        <View style={styles.options}>
          <Text style={styles.sectionLabel}>{t('entries.activity')}</Text>
          <View style={styles.activityRow}>
            {ACTIVITY_TYPES.map(({type, labelKey}) => (
              <TouchableOpacity
                key={type}
                style={[styles.activityBtn, activityType === type && styles.activityBtnActive]}
                onPress={() => setActivityType(type)}>
                <Text
                  style={[
                    styles.activityLabel,
                    activityType === type && styles.activityLabelActive,
                  ]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('entries.projectOptional')}</Text>
          <ProjectPicker
            projects={projects}
            selectedProjectId={projectId}
            onSelect={setProjectId}
            onCreate={addProject}
          />

          <Text style={styles.sectionLabel}>{t('entries.titleOptional')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('timer.titlePlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={120}
          />
        </View>
      )}

      <TouchableOpacity style={styles.startBtn} onPress={handleStart} disabled={busy}>
        <Text style={styles.startBtnText}>{t('timer.start')}</Text>
      </TouchableOpacity>
    </View>
  );
}
