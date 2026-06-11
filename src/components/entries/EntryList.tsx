import React from 'react';
import {FlatList, Text, StyleSheet, View} from 'react-native';
import type {Entry} from '../../types';
import EntryListItem from './EntryListItem';
import {colors, typography, spacing} from '../../theme';

interface Props {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
  /** Render items inline (no FlatList) when inside a ScrollView */
  inline?: boolean;
}

export default function EntryList({entries, onPressEntry, inline}: Props) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No entries yet. Tap + to add one.</Text>
      </View>
    );
  }

  if (inline) {
    return (
      <View>
        {entries.map(item => (
          <EntryListItem
            key={item.id}
            entry={item}
            onPress={() => onPressEntry(item)}
          />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={item => String(item.id)}
      renderItem={({item}) => (
        <EntryListItem entry={item} onPress={() => onPressEntry(item)} />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.sizes.base,
    textAlign: 'center',
  },
});
