import React, {useCallback, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {useTheme, typography, spacing} from '../theme';
import type {Colors} from '../theme';
import {getMediaEntries, type MediaItem} from '../db/entries';
import {periodKey, periodLabel, type PeriodMode} from '../utils/dateUtils';
import {fileUri} from '../utils/mediaUtils';
import GalleryDetailModal from '../components/media/GalleryDetailModal';
import GalleryMap from '../components/map/GalleryMap';
import type {Entry} from '../types';

type ViewMode = 'grid' | 'map';

const COLS = 3;
const GAP = 2;
const TILE = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

const MODES: {mode: PeriodMode; labelKey: string}[] = [
  {mode: 'day', labelKey: 'gallery.groupDay'},
  {mode: 'week', labelKey: 'gallery.groupWeek'},
  {mode: 'month', labelKey: 'gallery.groupMonth'},
];

const VIEW_MODES: {mode: ViewMode; labelKey: string}[] = [
  {mode: 'grid', labelKey: 'gallery.viewGrid'},
  {mode: 'map', labelKey: 'gallery.viewMap'},
];

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    segment: {
      flexDirection: 'row',
      backgroundColor: c.bgMuted,
      borderRadius: 999,
      padding: 3,
      margin: spacing.md,
    },
    segmentTight: {marginTop: 0},
    segBtn: {flex: 1, paddingVertical: spacing.xs, borderRadius: 999, alignItems: 'center'},
    segBtnActive: {backgroundColor: c.bgCard},
    segText: {fontSize: typography.sizes.sm, color: c.textMuted, fontWeight: typography.weights.medium},
    segTextActive: {color: c.primary, fontWeight: typography.weights.semibold},
    sectionHeader: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      backgroundColor: c.bg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    row: {flexDirection: 'row', gap: GAP, marginBottom: GAP},
    tile: {width: TILE, height: TILE, backgroundColor: c.bgMuted},
    tileImage: {width: TILE, height: TILE},
    tilePlaceholder: {width: TILE, height: TILE, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bgMuted},
    tilePlaceholderIcon: {fontSize: 24},
    videoBadge: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      backgroundColor: '#000a',
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    videoBadgeText: {color: '#fff', fontSize: 11},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm},
    emptyIcon: {fontSize: 44},
    emptyText: {color: c.textMuted, fontSize: typography.sizes.base, textAlign: 'center'},
  });

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    out.push(arr.slice(i, i + n));
  }
  return out;
}

function Tile({item, styles, onPress}: {item: MediaItem; styles: ReturnType<typeof makeStyles>; onPress: () => void}) {
  const [failed, setFailed] = useState(false);
  const uri = item.entry.thumbnail_path || item.entry.file_path;
  const isVideo = item.entry.entry_type === 'video';
  return (
    <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={onPress}>
      {uri && !failed ? (
        <Image source={{uri: fileUri(uri)}} style={styles.tileImage} onError={() => setFailed(true)} />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Text style={styles.tilePlaceholderIcon}>{isVideo ? '🎥' : '🖼️'}</Text>
        </View>
      )}
      {isVideo && (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function GalleryScreen() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<PeriodMode>('day');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMediaEntries().then(rows => { if (active) { setItems(rows); } }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  // Items are already newest-first; Map preserves that insertion order.
  const sections = useMemo(() => {
    const groups = new Map<string, {title: string; items: MediaItem[]}>();
    for (const item of items) {
      const key = periodKey(item.date, mode);
      const g = groups.get(key);
      if (g) { g.items.push(item); }
      else { groups.set(key, {title: periodLabel(item.date, mode), items: [item]}); }
    }
    return [...groups.entries()].map(([key, g]) => ({key, title: g.title, data: chunk(g.items, COLS)}));
  }, [items, mode]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.segment}>
        {VIEW_MODES.map(({mode: vm, labelKey}) => (
          <TouchableOpacity
            key={vm}
            style={[styles.segBtn, viewMode === vm && styles.segBtnActive]}
            onPress={() => setViewMode(vm)}>
            <Text style={[styles.segText, viewMode === vm && styles.segTextActive]}>{t(labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'grid' && (
        <View style={[styles.segment, styles.segmentTight]}>
          {MODES.map(({mode: m, labelKey}) => (
            <TouchableOpacity
              key={m}
              style={[styles.segBtn, mode === m && styles.segBtnActive]}
              onPress={() => setMode(m)}>
              <Text style={[styles.segText, mode === m && styles.segTextActive]}>{t(labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {viewMode === 'map' ? (
        <GalleryMap items={items} onSelect={setSelected} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyText}>{t('gallery.empty')}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row, i) => `${row[0]?.entry.id ?? 'r'}-${i}`}
          renderSectionHeader={({section}) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({item: row}) => (
            <View style={styles.row}>
              {row.map(media => (
                <Tile key={media.entry.id} item={media} styles={styles} onPress={() => setSelected(media.entry)} />
              ))}
            </View>
          )}
          stickySectionHeadersEnabled
          initialNumToRender={12}
          windowSize={11}
        />
      )}

      <GalleryDetailModal entry={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
