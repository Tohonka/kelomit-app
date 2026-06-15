import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, radius, spacing} from '../../theme';
import type {Colors} from '../../theme';

export interface FabAction {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
}

interface Props {
  onPress: () => void;
  label?: string;
  actions?: FabAction[];
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
    label: {color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '400'},
    backdrop: {flex: 1, backgroundColor: '#00000055'},
    dialWrap: {position: 'absolute', bottom: 24 + 58 + 16, right: 24, alignItems: 'flex-end', gap: spacing.md},
    actionRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    actionLabel: {
      backgroundColor: c.bgCard,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      shadowColor: c.shadow,
      shadowOpacity: 0.18,
      shadowOffset: {width: 0, height: 2},
      shadowRadius: 4,
      elevation: 3,
    },
    actionLabelText: {fontSize: typography.sizes.sm, color: c.textPrimary, fontWeight: typography.weights.medium},
    actionBtn: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.shadow,
      shadowOpacity: 0.2,
      shadowOffset: {width: 0, height: 2},
      shadowRadius: 5,
      elevation: 4,
    },
    closeFab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 58,
      height: 58,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
    },
  });

export default function FAB({onPress, label = '+', actions}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);
  const hasActions = !!actions && actions.length > 0;

  const runAction = (action: FabAction) => {
    setExpanded(false);
    action.onPress();
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={onPress}
        onLongPress={hasActions ? () => setExpanded(true) : undefined}
        delayLongPress={300}
        activeOpacity={0.8}>
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>

      {hasActions && (
        <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
          <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} />
          <View style={styles.dialWrap}>
            {actions!.map(a => (
              <View key={a.key} style={styles.actionRow}>
                <View style={styles.actionLabel}>
                  <Text style={styles.actionLabelText}>{a.label}</Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={() => runAction(a)} activeOpacity={0.8}>
                  <Icon name={a.icon} size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.closeFab} onPress={() => setExpanded(false)} activeOpacity={0.8}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}
