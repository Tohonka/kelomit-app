import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import MapView, {PROVIDER_GOOGLE} from 'react-native-maps';
import {bucketLocations, type LocationBucket} from '../../utils/bucketLocations';
import {regionFor} from '../../utils/mapRegion';
import LocationMarker from './LocationMarker';
import MarkerNotesSheet from './MarkerNotesSheet';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import type {MediaItem} from '../../db/entries';
import type {Entry} from '../../types';

interface Props {
  items: MediaItem[];
  onSelect: (entry: Entry) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1},
    map: {flex: 1},
    empty: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm},
    emptyIcon: {fontSize: 44},
    emptyText: {color: c.textMuted, fontSize: typography.sizes.base, textAlign: 'center'},
  });

export default function GalleryMap({items, onSelect}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // One marker per geotagged entry (an entry can own several media items).
  const located = useMemo(() => {
    const seen = new Set<number>();
    const out = [];
    for (const {entry} of items) {
      if (entry.latitude != null && entry.longitude != null && !seen.has(entry.id)) {
        seen.add(entry.id);
        out.push(entry);
      }
    }
    return out;
  }, [items]);

  const buckets = useMemo(() => bucketLocations(located, 50), [located]);
  const [openBucket, setOpenBucket] = useState<LocationBucket | null>(null);

  const region = useMemo(
    () => regionFor(buckets.map(b => ({latitude: b.latitude, longitude: b.longitude}))),
    [buckets],
  );

  if (located.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyText}>{t('gallery.noLocations')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region}>
        {buckets.map(bucket => (
          <LocationMarker
            key={bucket.entries[0].id}
            bucket={bucket}
            onPress={() =>
              bucket.entries.length === 1
                ? onSelect(bucket.entries[0])
                : setOpenBucket(bucket)
            }
          />
        ))}
      </MapView>
      <MarkerNotesSheet
        entries={openBucket?.entries ?? null}
        onSelect={onSelect}
        onClose={() => setOpenBucket(null)}
      />
    </View>
  );
}
