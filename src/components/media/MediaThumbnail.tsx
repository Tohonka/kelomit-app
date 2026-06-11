import React, {useMemo} from 'react';
import {View, Image, Text, StyleSheet} from 'react-native';
import {useTheme, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {EntryType} from '../../types';
import {fileUri} from '../../utils/mediaUtils';

interface Props {
  entryType: EntryType;
  thumbnailPath: string | null;
  size?: number;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    image: {backgroundColor: c.bgMuted},
    placeholder: {
      backgroundColor: c.bgMuted,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default function MediaThumbnail({entryType, thumbnailPath, size = 56}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (thumbnailPath) {
    return (
      <Image
        source={{uri: fileUri(thumbnailPath)}}
        style={[styles.image, {width: size, height: size, borderRadius: radius.sm}]}
      />
    );
  }

  const fallback = entryType === 'video' ? '🎥' : entryType === 'voice' ? '🎙️' : '📷';
  return (
    <View style={[styles.placeholder, {width: size, height: size}]}>
      <Text style={{fontSize: size * 0.4}}>{fallback}</Text>
    </View>
  );
}
