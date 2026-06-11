import React, {useMemo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme, radius} from '../../theme';
import type {Colors} from '../../theme';
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

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default function EntryTypeIcon({type, size = 36}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.container, {width: size, height: size}]}>
      <Text style={{fontSize: size * 0.5}}>{ICON[type]}</Text>
    </View>
  );
}
