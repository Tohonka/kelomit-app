import React from 'react';
import {FlatList, Text, StyleSheet, View} from 'react-native';
import type {Entry} from '../../types';
import EntryListItem from './EntryListItem';
import {colors, typography, spacing} from '../../theme';

interface Props {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
}

export default function EntryList({entries, onPressEntry}: Props) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No entries yet. Tap + to add one.</Text>
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
