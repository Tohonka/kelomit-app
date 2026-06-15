import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {searchEntries, type SearchResult} from '../db/entries';
import EntryListItem from '../components/entries/EntryListItem';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import {formatDate} from '../utils/dateUtils';
import type {RootStackScreenProps} from '../navigation/navigationTypes';

type Props = RootStackScreenProps<'SearchScreen'>;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    searchBar: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.bgCard,
    },
    input: {
      backgroundColor: c.bgMuted,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 44,
    },
    dateHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    loader: {marginTop: spacing.lg},
    empty: {padding: spacing.xxl, alignItems: 'center'},
    emptyText: {fontSize: typography.sizes.base, color: c.textMuted, textAlign: 'center'},
    countText: {
      fontSize: typography.sizes.xs,
      color: c.textMuted,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
  });

export default function SearchScreen({navigation}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchEntries(q);
        if (!cancelled) { setResults(r); setSearched(true); }
      } finally {
        if (!cancelled) { setLoading(false); }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Group results by day date (results are already date-sorted desc).
  const groups = useMemo(() => {
    const out: {date: string; items: SearchResult[]}[] = [];
    for (const r of results) {
      const last = out[out.length - 1];
      if (last && last.date === r.date) { last.items.push(r); }
      else { out.push({date: r.date, items: [r]}); }
    }
    return out;
  }, [results]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes, tags, projects…"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading && <ActivityIndicator style={styles.loader} color={colors.primary} />}

      {!loading && searched && results.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No matches for “{query.trim()}”.</Text>
        </View>
      )}

      {!searched && !loading && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Search across your notes, tags and projects.</Text>
        </View>
      )}

      {results.length > 0 && (
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.countText}>
            {results.length} result{results.length === 1 ? '' : 's'}
          </Text>
          {groups.map(group => (
            <View key={group.date}>
              <Text style={styles.dateHeader}>{formatDate(group.date)}</Text>
              {group.items.map(({entry}) => (
                <EntryListItem
                  key={entry.id}
                  entry={entry}
                  onPress={() =>
                    navigation.navigate('EntryDetailScreen', {entryId: entry.id, dayId: entry.day_id})
                  }
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
