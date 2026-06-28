import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {FlatList, Text, StyleSheet, TouchableOpacity, View} from 'react-native';
import type {Entry} from '../../types';
import EntryListItem from './EntryListItem';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {useSettingsStore} from '../../store/settingsStore';
import {
  groupEntries,
  nextDayListMode,
  type DayListMode,
  type EntryGroup,
} from '../../utils/entrySort';

interface Props {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
  inline?: boolean;
}

const SORT_LABEL: Record<DayListMode, string> = {
  time_desc: 'entries.sortTimeDesc',
  time_asc: 'entries.sortTimeAsc',
  project: 'entries.sortProject',
  type: 'entries.sortType',
};

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: {paddingBottom: 100},
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: spacing.xxl,
    },
    emptyText: {
      color: c.textMuted,
      fontSize: typography.sizes.base,
      textAlign: 'center',
    },
    sortRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.bg,
    },
    sortPillText: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    groupHeader: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
  });

export default function EntryList({entries, onPressEntry, inline}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mode = useSettingsStore(s => s.day_list_mode);
  const setMode = useSettingsStore(s => s.setDayListMode);

  const groups = useMemo(() => groupEntries(entries, mode), [entries, mode]);

  // 'type' titles are ActivityTypes; 'project' null = no-project bucket.
  // Time modes carry a single null-title group → no header.
  const headerFor = (g: EntryGroup): string | null => {
    if (g.title === null) {
      return mode === 'project' ? t('entries.noProject') : null;
    }
    return mode === 'type' ? t(`activity.${g.title}`) : g.title;
  };

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('entries.noEntries')}</Text>
      </View>
    );
  }

  const sortPill = (
    <View style={styles.sortRow}>
      <TouchableOpacity
        style={styles.sortPill}
        onPress={() => setMode(nextDayListMode(mode))}>
        <Text style={styles.sortPillText}>⇅ {t(SORT_LABEL[mode])}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGroups = () =>
    groups.map(g => {
      const header = headerFor(g);
      return (
        <View key={g.key}>
          {header != null && <Text style={styles.groupHeader}>{header}</Text>}
          {g.entries.map(item => (
            <EntryListItem
              key={item.id}
              entry={item}
              onPress={() => onPressEntry(item)}
            />
          ))}
        </View>
      );
    });

  if (inline) {
    return (
      <View>
        {sortPill}
        {renderGroups()}
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={g => g.key}
      ListHeaderComponent={sortPill}
      renderItem={({item: g}) => {
        const header = headerFor(g);
        return (
          <View>
            {header != null && <Text style={styles.groupHeader}>{header}</Text>}
            {g.entries.map(item => (
              <EntryListItem
                key={item.id}
                entry={item}
                onPress={() => onPressEntry(item)}
              />
            ))}
          </View>
        );
      }}
      contentContainerStyle={styles.list}
    />
  );
}
