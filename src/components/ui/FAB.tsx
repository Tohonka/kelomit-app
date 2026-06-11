import React, {useMemo} from 'react';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import {useTheme, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  onPress: () => void;
  label?: string;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 58,
      height: 58,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.25,
      shadowOffset: {width: 0, height: 4},
      shadowRadius: 8,
      elevation: 6,
    },
    label: {
      color: '#fff',
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '400',
    },
  });

export default function FAB({onPress, label = '+'}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}
