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
    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
    },
    projectInfo: {flex: 1},
    projectName: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: c.textPrimary,
    },
    archived: {color: c.textMuted, textDecorationLine: 'line-through'},
    projectType: {fontSize: typography.sizes.sm, color: c.textMuted, marginTop: 2},
    actionBtn: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
    actionBtnText: {
      color: c.primary,
      fontWeight: typography.weights.medium,
      fontSize: typography.sizes.sm,
    },
  });

export default function ProjectsScreen() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {projects, loaded, load, add, archive, unarchive} = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Project['type']>('work');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

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
            <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived(s => !s)}>
              <Text style={styles.archiveToggleText}>
                {showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
              </Text>
            </TouchableOpacity>
          </>
        }
        renderItem={({item}) => (
          <View style={styles.projectRow}>
            <View style={styles.projectInfo}>
              <Text style={[styles.projectName, item.archived && styles.archived]}>
                {item.name}
              </Text>
              <Text style={styles.projectType}>{t(`projectType.${item.type}`)}</Text>
            </View>
            {item.archived ? (
              <TouchableOpacity onPress={() => unarchive(item.id)} style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>{t('common.restore')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(t('projects.archiveTitle'), t('projects.archiveMessage', {name: item.name}), [
                    {text: t('common.cancel'), style: 'cancel'},
                    {text: t('common.archive'), onPress: () => archive(item.id)},
                  ]);
                }}
                style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>{t('common.archive')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}
