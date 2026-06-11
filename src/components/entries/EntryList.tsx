import React, {useMemo} from 'react';
import {FlatList, Text, StyleSheet, View} from 'react-native';
import type {Entry} from '../../types';
import EntryListItem from './EntryListItem';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
  inline?: boolean;
}

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
  });

export default function EntryList({entries, onPressEntry, inline}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
          <EntryListItem key={item.id} entry={item} onPress={() => onPressEntry(item)} />
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
