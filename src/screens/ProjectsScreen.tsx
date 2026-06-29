import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useProjectStore} from '../store/projectStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import ActionSheet from '../components/ui/ActionSheet';
import type {Project} from '../types';

const TYPE_OPTIONS: {type: Project['type']; labelKey: string}[] = [
  {type: 'work', labelKey: 'projectType.work'},
  {type: 'personal', labelKey: 'projectType.personal'},
  {type: 'other', labelKey: 'projectType.other'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    list: {paddingBottom: spacing.xxl},
    form: {
      margin: spacing.lg,
      backgroundColor: c.bgCard,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    formLabel: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
    },
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
    typeRow: {flexDirection: 'row', gap: spacing.sm},
    typeBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    typeBtnActive: {borderColor: c.primary, backgroundColor: c.primary + '15'},
    typeBtnText: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    typeBtnTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    formBtns: {flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end'},
    formBtn: {minWidth: 80},
    addRow: {
      margin: spacing.lg,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.primary,
      borderStyle: 'dashed',
      alignItems: 'center',
    },
    addLabel: {
      color: c.primary,
      fontWeight: typography.weights.semibold,
      fontSize: typography.sizes.base,
    },
    archiveToggle: {paddingHorizontal: spacing.lg, paddingBottom: spacing.sm},
    archiveToggleText: {
      color: c.textMuted,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
    },
    banner: {
      backgroundColor: c.primary + '15',
      borderBottomWidth: 1,
      borderBottomColor: c.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    bannerText: {flex: 1, color: c.textPrimary, fontSize: typography.sizes.sm},
    bannerCancel: {color: c.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm},
    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
      minHeight: 56,
    },
    rowTarget: {backgroundColor: c.primary + '0C'},
    projectInfo: {flex: 1},
    projectName: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    archived: {color: c.textMuted, textDecorationLine: 'line-through'},
    projectType: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    editInput: {
      flex: 1,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      marginRight: spacing.sm,
    },
    editBtn: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
    editBtnText: {color: c.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm},
  });

export default function ProjectsScreen() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {projects, loaded, load, add, archive, unarchive, rename, merge, remove} = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Project['type']>('work');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [mergeSource, setMergeSource] = useState<Project | null>(null);
  const [actionProject, setActionProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!loaded) { load(); }
  }, [loaded, load]);

  const handleAdd = async () => {
    const n = name.trim();
    if (!n) { Alert.alert(t('projects.nameRequired')); return; }
    setIsSaving(true);
    try {
      await add(n, type);
      setName('');
      setType('work');
      setShowForm(false);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const saveRename = async () => {
    const n = editName.trim();
    const id = editingId;
    if (!n || id == null) { setEditingId(null); return; }
    const clash = projects.find(p => p.id !== id && p.name.toLowerCase() === n.toLowerCase());
    if (clash) {
      Alert.alert(t('common.rename'), t('manager.nameTakenProject', {name: n}));
      return;
    }
    await rename(id, n);
    setEditingId(null);
  };

  const confirmMerge = (target: Project) => {
    const src = mergeSource;
    if (!src || target.id === src.id) { return; }
    Alert.alert(
      t('manager.mergeTitle'),
      t('manager.mergeProjectMessage', {from: src.name, to: target.name}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.merge'),
          onPress: async () => { await merge(target.id, src.id); setMergeSource(null); },
        },
      ],
    );
  };

  const confirmDelete = (project: Project) => {
    Alert.alert(t('manager.deleteProjectTitle'), t('manager.deleteProjectMessage', {name: project.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => remove(project.id)},
    ]);
  };

  const visible = projects.filter(p => showArchived || !p.archived);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={visible}
        keyExtractor={item => String(item.id)}
        ListHeaderComponent={
          <>
            {showForm ? (
              <View style={styles.form}>
                <Text style={styles.formLabel}>{t('projects.newProject')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('projects.projectName')}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  maxLength={80}
                />
                <View style={styles.typeRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.type}
                      style={[styles.typeBtn, type === o.type && styles.typeBtnActive]}
                      onPress={() => setType(o.type)}>
                      <Text style={[styles.typeBtnText, type === o.type && styles.typeBtnTextActive]}>
                        {t(o.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.formBtns}>
                  <Button label={t('common.cancel')} variant="ghost" onPress={() => setShowForm(false)} style={styles.formBtn} />
                  <Button label={t('common.add')} onPress={handleAdd} loading={isSaving} style={styles.formBtn} />
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRow} onPress={() => setShowForm(true)}>
                <Text style={styles.addLabel}>{t('projects.newProjectButton')}</Text>
              </TouchableOpacity>
            )}
            {mergeSource && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  {t('manager.mergeBannerProject', {name: mergeSource.name})}
                </Text>
                <TouchableOpacity onPress={() => setMergeSource(null)}>
                  <Text style={styles.bannerCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived(s => !s)}>
              <Text style={styles.archiveToggleText}>
                {showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
              </Text>
            </TouchableOpacity>
          </>
        }
        renderItem={({item}) => {
          if (editingId === item.id) {
            return (
              <View style={styles.projectRow}>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  maxLength={80}
                  onSubmitEditing={saveRename}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.editBtn} onPress={saveRename}>
                  <Text style={styles.editBtnText}>{t('common.save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditingId(null)}>
                  <Text style={styles.editBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            );
          }
          const isMergeTarget = mergeSource != null && mergeSource.id !== item.id;
          return (
            <TouchableOpacity
              style={[styles.projectRow, isMergeTarget && styles.rowTarget]}
              onPress={() => (mergeSource ? confirmMerge(item) : setActionProject(item))}
              disabled={mergeSource != null && mergeSource.id === item.id}>
              <View style={styles.projectInfo}>
                <Text style={[styles.projectName, item.archived && styles.archived]}>
                  {item.name}
                </Text>
                <Text style={styles.projectType}>{t(`projectType.${item.type}`)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
      />
      <ActionSheet
        visible={actionProject != null}
        title={actionProject?.name}
        onClose={() => setActionProject(null)}
        actions={
          actionProject
            ? [
                {label: t('common.rename'), onPress: () => { setEditingId(actionProject.id); setEditName(actionProject.name); }},
                {label: t('manager.mergeInto'), onPress: () => setMergeSource(actionProject)},
                actionProject.archived
                  ? {label: t('common.restore'), onPress: () => unarchive(actionProject.id)}
                  : {label: t('common.archive'), onPress: () => archive(actionProject.id)},
                {label: t('common.delete'), destructive: true, onPress: () => confirmDelete(actionProject)},
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}
