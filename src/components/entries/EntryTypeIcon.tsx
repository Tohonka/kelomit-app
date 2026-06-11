import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {colors, radius} from '../../theme';
import type {EntryType} from '../../types';

const ICON: Record<EntryType, string> = {
  note: '✏️',
  photo: '📷',
  video: '🎥',
  voice: '🎙️',
};

interface Props {
  type: EntryType;
  size?: number;
}

export default function EntryTypeIcon({type, size = 36}: Props) {
  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <Text style={{fontSize: size * 0.5}}>{ICON[type]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
