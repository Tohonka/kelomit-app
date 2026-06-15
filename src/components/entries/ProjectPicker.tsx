import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {getMostUsedProjectIds} from '../../db/projects';
import type {Project, ProjectType} from '../../types';

interface Props {
  projects: Project[];
  selectedProjectId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: (name: string, type: ProjectType) => Promise<Project>;
  onSearchFocus?: () => void;
}

const CREATE_TYPES: {type: ProjectType; labelKey: string}[] = [
  {type: 'work', labelKey: 'projectType.work'},
  {type: 'personal', labelKey: 'projectType.personal'},
  {type: 'other', labelKey: 'projectType.other'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    chipActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    chipText: {fontSize: typography.sizes.sm, color: c.textSecondary, fontWeight: typography.weights.medium},
    chipTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    search: {
      marginTop: spacing.sm,
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
    results: {
      marginTop: 2,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    resultRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    resultText: {fontSize: typography.sizes.base, color: c.textPrimary},
    createRow: {padding: spacing.md, gap: spacing.sm},
    createLabel: {fontSize: typography.sizes.sm, color: c.textMuted},
    createName: {color: c.textPrimary, fontWeight: typography.weights.semibold},
    createTypes: {flexDirection: 'row', gap: spacing.sm},
    createBtn: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.primary,
      backgroundColor: c.primary + '12',
      alignItems: 'center',
    },
    createBtnText: {fontSize: typography.sizes.sm, color: c.primary, fontWeight: typography.weights.semibold},
  });

export default function ProjectPicker({
  projects,
  selectedProjectId,
  onSelect,
  onCreate,
  onSearchFocus,
}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [mostUsedIds, setMostUsedIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getMostUsedProjectIds(3).then(setMostUsedIds).catch(() => {});
  }, []);

  const byId = useMemo(() => {
    const m = new Map<number, Project>();
    projects.forEach(p => m.set(p.id, p));
    return m;
  }, [projects]);

  // Quick chips: most-used (in rank order), plus the current selection if not already shown.
  const quickProjects = useMemo(() => {
    const ids = mostUsedIds.filter(id => byId.has(id));
    if (selectedProjectId != null && !ids.includes(selectedProjectId) && byId.has(selectedProjectId)) {
      ids.push(selectedProjectId);
    }
    return ids.map(id => byId.get(id)!);
  }, [mostUsedIds, selectedProjectId, byId]);

  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query.length === 0
        ? []
        : projects.filter(p => p.name.toLowerCase().includes(query)).slice(0, 6),
    [projects, query],
  );
  const exactMatch = projects.some(p => p.name.toLowerCase() === query);

  const handleCreate = async (type: ProjectType) => {
    const name = search.trim();
    if (!name || creating) { return; }
    setCreating(true);
    try {
      const project = await onCreate(name, type);
      onSelect(project.id);
      setSearch('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <View>
      <View style={styles.chipsRow}>
        <TouchableOpacity
          style={[styles.chip, selectedProjectId == null && styles.chipActive]}
          onPress={() => onSelect(null)}>
          <Text style={[styles.chipText, selectedProjectId == null && styles.chipTextActive]}>
            {t('common.none')}
          </Text>
        </TouchableOpacity>
        {quickProjects.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, selectedProjectId === p.id && styles.chipActive]}
            onPress={() => onSelect(p.id)}>
            <Text style={[styles.chipText, selectedProjectId === p.id && styles.chipTextActive]}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        onFocus={onSearchFocus}
        placeholder={t('entries.searchProjectPlaceholder')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
      />

      {query.length > 0 && (
        <View style={styles.results}>
          {matches.map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.resultRow}
              onPress={() => { onSelect(p.id); setSearch(''); }}>
              <Text style={styles.resultText}>{p.name}</Text>
            </TouchableOpacity>
          ))}
          {!exactMatch && (
            <View style={styles.createRow}>
              <Text style={styles.createLabel}>
                {t('entries.createProjectAs')}{' '}
                <Text style={styles.createName}>“{search.trim()}”</Text>{' '}
                {t('entries.createProjectAsSuffix')}
              </Text>
              <View style={styles.createTypes}>
                {CREATE_TYPES.map(({type, labelKey}) => (
                  <TouchableOpacity
                    key={type}
                    style={styles.createBtn}
                    disabled={creating}
                    onPress={() => handleCreate(type)}>
                    <Text style={styles.createBtnText}>{t(labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
