import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet} from 'react-native';
import MapView, {Marker, PROVIDER_GOOGLE, type Region} from 'react-native-maps';
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

/** Bounding region around all points, with sane padding and minimum deltas. */
function regionFor(points: {latitude: number; longitude: number}[]): Region | undefined {
  if (points.length === 0) {
    return undefined;
  }
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };
}

export default function GalleryMap({items, onSelect}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const located = useMemo(
    () => items.filter(i => i.entry.latitude != null && i.entry.longitude != null),
    [items],
  );

  const region = useMemo(
    () => regionFor(located.map(i => ({latitude: i.entry.latitude!, longitude: i.entry.longitude!}))),
    [located],
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
        {located.map(({entry}) => (
          <Marker
            key={entry.id}
            coordinate={{latitude: entry.latitude!, longitude: entry.longitude!}}
            title={entry.title ?? undefined}
            description={entry.location_label ?? undefined}
            onCalloutPress={() => onSelect(entry)}
            onPress={() => onSelect(entry)}
          />
        ))}
      </MapView>
    </View>
  );
}
