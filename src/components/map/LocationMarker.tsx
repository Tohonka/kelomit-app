import React, {useMemo, useState} from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {Marker} from 'react-native-maps';
import {useTheme, typography} from '../../theme';
import type {Colors} from '../../theme';
import {fileUri, firstVisualMedia} from '../../utils/mediaUtils';
import type {LocationBucket} from '../../utils/bucketLocations';

interface Props {
  bucket: LocationBucket;
  onPress: () => void;
}

const SIZE = 48;
const TRI = 8; // triangle half-width / height

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {alignItems: 'center'},
    circle: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: c.bgCard,
      borderWidth: 3,
      borderColor: c.primary,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: {width: SIZE, height: SIZE},
    glyph: {fontSize: 22},
    triangle: {
      width: 0,
      height: 0,
      borderLeftWidth: TRI,
      borderRightWidth: TRI,
      borderTopWidth: TRI,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.primary,
      marginTop: -1,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 4,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {color: '#fff', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold},
  });

export default function LocationMarker({bucket, onPress}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const newest = bucket.entries[0];
  const media = firstVisualMedia(newest);
  const uri = media ? fileUri(media.thumbnail_path || media.file_path) : null;
  const count = bucket.entries.length;

  // tracksViewChanges must go false once the view is stable, or the map janks
  // on Android (re-renders every marker every frame). No image → stable at mount.
  const [track, setTrack] = useState<boolean>(uri != null);

  return (
    <Marker
      coordinate={{latitude: bucket.latitude, longitude: bucket.longitude}}
      onPress={onPress}
      tracksViewChanges={track}
      anchor={{x: 0.5, y: 1}}>
      <View style={styles.wrap}>
        <View style={styles.circle}>
          {uri ? (
            <Image
              source={{uri}}
              style={styles.image}
              onLoad={() => setTrack(false)}
              onError={() => setTrack(false)}
            />
          ) : (
            <Text style={styles.glyph}>{media?.media_type === 'video' ? '🎥' : '📝'}</Text>
          )}
        </View>
        <View style={styles.triangle} />
        {count > 1 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
}
