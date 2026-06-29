import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../theme';
import type {RootStackScreenProps} from '../../navigation/navigationTypes';
import {makeSettingsStyles} from './settingsStyles';

type Props = RootStackScreenProps<'TagsProjectsSettings'>;

export default function TagsProjectsSettings({navigation}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('manager.tagsProjectsTitle')}</Text>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ProjectsScreen')}>
          <Text style={styles.rowLabel}>{t('manager.manageProjects')}</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TagsScreen')}>
          <Text style={styles.rowLabel}>{t('manager.manageTags')}</Text>
          <Text style={styles.rowCaret}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
