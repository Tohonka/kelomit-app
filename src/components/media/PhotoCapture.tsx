import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity, Image, StyleSheet, Alert} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {ensureCameraPermission, ensureMediaLibraryPermission} from '../../services/permissionService';
import {makeMediaPath, fileUri} from '../../utils/mediaUtils';

interface Props {
  filePath: string | null;
  onCapture: (filePath: string, thumbnailPath: string) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: {flexDirection: 'row', gap: spacing.md},
    btn: {
      flex: 1,
      paddingVertical: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      gap: spacing.xs,
    },
    btnEmoji: {fontSize: 28},
    btnLabel: {
      fontSize: typography.sizes.sm,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    preview: {gap: spacing.sm},
    image: {
      width: '100%',
      height: 200,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
    },
    replaceBtn: {alignItems: 'center', paddingVertical: spacing.sm},
    replaceBtnText: {
      color: c.primary,
      fontWeight: typography.weights.semibold,
      fontSize: typography.sizes.sm,
    },
  });

export default function PhotoCapture({filePath, onCapture}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleCamera = async () => {
    const ok = await ensureCameraPermission();
    if (!ok) { return; }
    const result = await launchCamera({mediaType: 'photo', quality: 0.8, saveToPhotos: false});
    if (result.assets?.[0]?.uri) { await savePhoto(result.assets[0].uri); }
  };

  const handleGallery = async () => {
    const ok = await ensureMediaLibraryPermission();
    if (!ok) { return; }
    const result = await launchImageLibrary({mediaType: 'photo', quality: 0.8});
    if (result.assets?.[0]?.uri) { await savePhoto(result.assets[0].uri); }
  };

  const savePhoto = async (sourceUri: string) => {
    try {
      const destPath = makeMediaPath('photo', 'jpg');
      const src = sourceUri.replace('file://', '');
      await RNFS.copyFile(src, destPath);
      onCapture(destPath, destPath);
    } catch (e) {
      Alert.alert('Error saving photo', String(e));
    }
  };

  if (filePath) {
    return (
      <View style={styles.preview}>
        <Image source={{uri: fileUri(filePath)}} style={styles.image} />
        <TouchableOpacity style={styles.replaceBtn} onPress={handleCamera}>
          <Text style={styles.replaceBtnText}>Replace</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.btn} onPress={handleCamera} activeOpacity={0.7}>
        <Text style={styles.btnEmoji}>📷</Text>
        <Text style={styles.btnLabel}>Camera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={handleGallery} activeOpacity={0.7}>
        <Text style={styles.btnEmoji}>🖼️</Text>
        <Text style={styles.btnLabel}>Gallery</Text>
      </TouchableOpacity>
    </View>
  );
}
