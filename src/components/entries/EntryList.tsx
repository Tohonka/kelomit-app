import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {FlatList, Text, StyleSheet, TouchableOpacity, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Entry, ActivityType} from '../../types';
import EntryListItem from './EntryListItem';
import MediaThumbnail from '../media/MediaThumbnail';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {useSettingsStore} from '../../store/settingsStore';
import {formatTime, durationBetween} from '../../utils/dateUtils';
import {
  groupEntries,
  nextDayListMode,
  type DayListMode,
  type EntryGroup,
} from '../../utils/entrySort';

interface Props {
  entries: Entry[];
  onPressEntry: (entry: Entry) => void;
  /** Card rows only: shows a trailing + on top-level notes. */
  onAddSubnote?: (entry: Entry) => void;
  /** Render subnotes nested under their parent (else a ▸ N badge). */
  showSubnotes?: boolean;
  inline?: boolean;
  /** Redesign look: compact rows inside a rounded card (Today / Day). */
  card?: boolean;
}

const SORT_LABEL: Record<DayListMode, string> = {
  time_desc: 'entries.sortTimeDesc',
  time_asc: 'entries.sortTimeAsc',
  project: 'entries.sortProject',
  type: 'entries.sortType',
};

const ACTIVITY_TINT: Record<ActivityType, keyof Colors> = {
  work: 'badgeWork',
  personal_work: 'badgePersonalWork',
  personal: 'badgePersonal',
};

const TYPE_GLYPH: Record<string, string> = {note: '✏️', photo: '📷', video: '🎥', voice: '🎙️'};

function durationClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    list: {paddingBottom: 100},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl},
    emptyText: {color: c.textMuted, fontSize: typography.sizes.base, textAlign: 'center'},
    sortRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    sortRowCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    eyebrow: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
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
    // Card variant
    card: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    cardHeader: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14},
    rowDivider: {borderTopWidth: 1, borderTopColor: c.bgMuted},
    rowNested: {paddingLeft: spacing.lg + 20, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth},
    swatch: {width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center'},
    swatchGlyph: {fontSize: 16},
    rowBody: {flex: 1},
    rowTitle: {fontSize: 14, fontWeight: typography.weights.semibold, color: c.textPrimary},
    rowTitleDone: {textDecorationLine: 'line-through', color: c.textMuted},
    rowMeta: {fontSize: 12, color: c.textMuted, marginTop: 2},
    countBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: {fontSize: 11, fontWeight: typography.weights.bold, color: c.textSecondary},
    addSub: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bgMuted,
    },
  });

function CardRow({
  entry,
  onPress,
  onAddSubnote,
  first,
  nested,
  subCount,
  styles,
  colors,
  t,
}: {
  entry: Entry;
  onPress: () => void;
  onAddSubnote?: () => void;
  first: boolean;
  /** Rendered under a parent: indented, no + button. */
  nested?: boolean;
  /** Collapsed subnote count badge. */
  subCount?: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Colors;
  t: (k: string) => string;
}) {
  const media = entry.media ?? [];
  const photo = media.find(m => m.media_type === 'photo');
  const durSec =
    entry.duration_sec ??
    (entry.time_from && entry.time_to ? Math.max(0, durationBetween(entry.time_from, entry.time_to)) : null);
  const time = entry.time_from ? formatTime(entry.time_from) : formatTime(entry.created_at);
  const meta = [
    time,
    durSec && durSec > 0 ? durationClock(durSec) : null,
    t(`activity.${entry.activity_type}`),
    entry.project?.name,
  ]
    .filter(Boolean)
    .join(' · ');
  const done = entry.is_todo && entry.completed_at != null;
  const tint = colors[ACTIVITY_TINT[entry.activity_type]];

  return (
    <Pressable style={[styles.row, !first && styles.rowDivider, nested && styles.rowNested]} onPress={onPress}>
      {photo ? (
        <MediaThumbnail entryType="photo" thumbnailPath={photo.thumbnail_path || photo.file_path} size={34} />
      ) : (
        <View style={[styles.swatch, {backgroundColor: tint + '26'}]}>
          <Text style={styles.swatchGlyph}>{TYPE_GLYPH[media[0]?.media_type ?? 'note']}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={1}>
          {entry.title || entry.body || t('entryType.note')}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
      </View>
      {media.length > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{media.length}</Text>
        </View>
      ) : null}
      {subCount ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>▸ {subCount}</Text>
        </View>
      ) : null}
      {onAddSubnote && !nested && entry.parent_id == null ? (
        <Pressable
          style={styles.addSub}
          hitSlop={8}
          onPress={onAddSubnote}
          accessibilityLabel={t('subnotes.add')}>
          <Icon name="plus" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function EntryList({entries, onPressEntry, onAddSubnote, showSubnotes, inline, card}: Props) {
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
    <View style={card ? styles.sortRowCard : styles.sortRow}>
      {card && <Text style={styles.eyebrow}>{t('entries.listTitle')}</Text>}
      <TouchableOpacity style={styles.sortPill} onPress={() => setMode(nextDayListMode(mode))}>
        <Text style={styles.sortPillText}>⇅ {t(SORT_LABEL[mode])}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGroup = (g: EntryGroup) => {
    const header = headerFor(g);
    if (card) {
      return (
        <View key={g.key}>
          {header != null && <Text style={styles.cardHeader}>{header}</Text>}
          <View style={styles.card}>
            {g.items.map(({entry: item, subnotes}, i) => (
              <React.Fragment key={item.id}>
                <CardRow
                  entry={item}
                  first={i === 0}
                  subCount={!showSubnotes ? subnotes.length : undefined}
                  onPress={() => onPressEntry(item)}
                  onAddSubnote={onAddSubnote ? () => onAddSubnote(item) : undefined}
                  styles={styles}
                  colors={colors}
                  t={t}
                />
                {showSubnotes && subnotes.map(sub => (
                  <CardRow
                    key={sub.id}
                    entry={sub}
                    first={false}
                    nested
                    onPress={() => onPressEntry(sub)}
                    styles={styles}
                    colors={colors}
                    t={t}
                  />
                ))}
              </React.Fragment>
            ))}
          </View>
        </View>
      );
    }
    return (
      <View key={g.key}>
        {header != null && <Text style={styles.groupHeader}>{header}</Text>}
        {g.items.flatMap(({entry: item, subnotes}) => [item, ...subnotes]).map(item => (
          <EntryListItem key={item.id} entry={item} onPress={() => onPressEntry(item)} />
        ))}
      </View>
    );
  };

  if (inline) {
    return (
      <View>
        {sortPill}
        {groups.map(renderGroup)}
      </View>
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={g => g.key}
      ListHeaderComponent={sortPill}
      renderItem={({item: g}) => renderGroup(g)}
      contentContainerStyle={styles.list}
    />
  );
}
