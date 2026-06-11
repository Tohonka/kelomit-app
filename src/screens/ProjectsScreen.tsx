import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import {useProjectStore} from '../store/projectStore';
import {colors, typography, spacing, radius} from '../theme';
import Button from '../components/ui/Button';
import type {Project} from '../types';

const TYPE_OPTIONS: {type: Project['type']; label: string}[] = [
  {type: 'work', label: 'Work'},
  {type: 'personal', label: 'Personal'},
  {type: 'other', label: 'Other'},
];

export default function ProjectsScreen() {
  const {projects, loaded, load, add, archive, unarchive} = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Project['type']>('work');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!loaded) {
      load();
    }
  }, [loaded, load]);

  const handleAdd = async () => {
    const n = name.trim();
    if (!n) {
      Alert.alert('Name required');
      return;
    }
    setIsSaving(true);
    try {
      await add(n, type);
      setName('');
      setType('work');
      setShowForm(false);
    } catch (e) {
      Alert.alert('Error', String(e));
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
                <Text style={styles.formLabel}>New project</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Project name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  maxLength={80}
                />
                <View style={styles.typeRow}>
                  {TYPE_OPTIONS.map(o => (
                    <TouchableOpacity
                      key={o.type}
                      style={[
                        styles.typeBtn,
                        type === o.type && styles.typeBtnActive,
                      ]}
                      onPress={() => setType(o.type)}>
                      <Text
                        style={[
                          styles.typeBtnText,
                          type === o.type && styles.typeBtnTextActive,
                        ]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.formBtns}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setShowForm(false)}
                    style={styles.formBtn}
                  />
                  <Button
                    label="Add"
                    onPress={handleAdd}
                    loading={isSaving}
                    style={styles.formBtn}
                  />
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addRow}
                onPress={() => setShowForm(true)}>
                <Text style={styles.addLabel}>+ New project</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.archiveToggle}
              onPress={() => setShowArchived(s => !s)}>
              <Text style={styles.archiveToggleText}>
                {showArchived ? 'Hide archived' : 'Show archived'}
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
              <Text style={styles.projectType}>{item.type}</Text>
            </View>
            {item.archived ? (
              <TouchableOpacity
                onPress={() => unarchive(item.id)}
                style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>Restore</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Archive project',
                    `Archive "${item.name}"? It won't appear in new entries.`,
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Archive',
                        onPress: () => archive(item.id),
                      },
                    ],
                  );
                }}
                style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>Archive</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  list: {paddingBottom: spacing.xxl},
  form: {
    margin: spacing.lg,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  formLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    minHeight: 48,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  typeBtnText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  typeBtnTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  formBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  formBtn: {minWidth: 80},
  addRow: {
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addLabel: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.base,
  },
  archiveToggle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  archiveToggleText: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  projectInfo: {flex: 1},
  projectName: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  archived: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  projectType: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionBtnText: {
    color: colors.primary,
    fontWeight: typography.weights.medium,
    fontSize: typography.sizes.sm,
  },
});
