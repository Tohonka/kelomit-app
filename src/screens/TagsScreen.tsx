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
import {useTagStore} from '../store/tagStore';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import ActionSheet from '../components/ui/ActionSheet';
import type {Tag} from '../types';

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    list: {paddingBottom: spacing.xxl},
    addRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'center',
      margin: spacing.lg,
    },
    input: {
      flex: 1,
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
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
      minHeight: 56,
    },
    tagRowTarget: {backgroundColor: c.primary + '0C'},
    tagName: {flex: 1, fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
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
    empty: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.textMuted, fontSize: typography.sizes.sm},
  });

export default function TagsScreen() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {tags, loaded, load, getOrCreate, rename, merge, remove} = useTagStore();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [mergeSource, setMergeSource] = useState<Tag | null>(null);
  const [actionTag, setActionTag] = useState<Tag | null>(null);

  useEffect(() => { if (!loaded) { load(); } }, [loaded, load]);

  const handleAdd = async () => {
    const n = name.trim();
    if (!n) { return; }
    await getOrCreate(n);
    setName('');
  };

  const startRename = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
  };

  const saveRename = async () => {
    const n = editName.trim();
    const id = editingId;
    if (!n || id == null) { setEditingId(null); return; }
    const clash = tags.find(tg => tg.id !== id && tg.name.toLowerCase() === n.toLowerCase());
    if (clash) {
      Alert.alert(t('common.rename'), t('manager.nameTakenTag', {name: n}));
      return;
    }
    await rename(id, n);
    setEditingId(null);
  };

  const confirmMerge = (target: Tag) => {
    const src = mergeSource;
    if (!src || target.id === src.id) { return; }
    Alert.alert(
      t('manager.mergeTitle'),
      t('manager.mergeTagMessage', {from: src.name, to: target.name}),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('common.merge'),
          onPress: async () => { await merge(target.id, src.id); setMergeSource(null); },
        },
      ],
    );
  };

  const confirmDelete = (tag: Tag) => {
    Alert.alert(t('manager.deleteTagTitle'), t('manager.deleteTagMessage', {name: tag.name}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => remove(tag.id)},
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={tags}
        keyExtractor={item => String(item.id)}
        ListHeaderComponent={
          <>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('manager.tagName')}
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                autoCapitalize="none"
                onSubmitEditing={handleAdd}
                returnKeyType="done"
              />
              <Button label={t('common.add')} onPress={handleAdd} />
            </View>
            {mergeSource && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  {t('manager.mergeBannerTag', {name: mergeSource.name})}
                </Text>
                <TouchableOpacity onPress={() => setMergeSource(null)}>
                  <Text style={styles.bannerCancel}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            )}
            {tags.length === 0 && <Text style={styles.empty}>{t('manager.noTags')}</Text>}
          </>
        }
        renderItem={({item}) => {
          const isMergeTarget = mergeSource != null && mergeSource.id !== item.id;
          if (editingId === item.id) {
            return (
              <View style={styles.tagRow}>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  autoCapitalize="none"
                  maxLength={40}
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
          return (
            <TouchableOpacity
              style={[styles.tagRow, isMergeTarget && styles.tagRowTarget]}
              onPress={() => (mergeSource ? confirmMerge(item) : setActionTag(item))}
              disabled={mergeSource != null && mergeSource.id === item.id}>
              <Text style={styles.tagName}>#{item.name}</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
      />
      <ActionSheet
        visible={actionTag != null}
        title={actionTag ? `#${actionTag.name}` : undefined}
        onClose={() => setActionTag(null)}
        actions={
          actionTag
            ? [
                {label: t('common.rename'), onPress: () => startRename(actionTag)},
                {label: t('manager.mergeInto'), onPress: () => setMergeSource(actionTag)},
                {label: t('common.delete'), destructive: true, onPress: () => confirmDelete(actionTag)},
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}
