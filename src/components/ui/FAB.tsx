import React from 'react';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import {colors, radius} from '../../theme';

interface Props {
  onPress: () => void;
  label?: string;
}

export default function FAB({onPress, label = '+'}: Props) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
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
