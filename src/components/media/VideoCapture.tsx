import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {ensureCameraPermission} from '../../services/permissionService';
import {makeMediaPath} from '../../utils/mediaUtils';

interface Props {
  filePath: string | null;
  onCapture: (filePath: string, thumbnailPath: string | null) => void;
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
    captured: {
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      gap: spacing.xs,
    },
    capturedIcon: {fontSize: 36},
    capturedText: {fontSize: typography.sizes.base, color: c.textSecondary},
    replaceBtnText: {
      color: c.primary,
      fontWeight: typography.weights.semibold,
      fontSize: typography.sizes.sm,
    },
  });

export default function VideoCapture({filePath, onCapture}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const handleCamera = async () => {
    const ok = await ensureCameraPermission();
    if (!ok) { return; }
    const result = await launchCamera({mediaType: 'video', videoQuality: 'medium', durationLimit: 300});
    if (result.assets?.[0]?.uri) { await saveVideo(result.assets[0].uri); }
  };

  const handleGallery = async () => {
    // Uses the Android system photo picker (per-item access) — no media
    // permission needed. See Iteration 3 Phase 2.
    const result = await launchImageLibrary({mediaType: 'video'});
    if (result.assets?.[0]?.uri) { await saveVideo(result.assets[0].uri); }
  };

  const saveVideo = async (sourceUri: string) => {
    try {
      const destPath = makeMediaPath('video', 'mp4');
      const src = sourceUri.replace('file://', '');
      await RNFS.copyFile(src, destPath);
      onCapture(destPath, null);
    } catch (e) {
      Alert.alert(t('media.errorSavingVideo'), String(e));
    }
  };

  if (filePath) {
    return (
      <View style={styles.captured}>
        <Text style={styles.capturedIcon}>🎥</Text>
        <Text style={styles.capturedText}>{t('media.videoCaptured')}</Text>
        <TouchableOpacity onPress={handleCamera}>
          <Text style={styles.replaceBtnText}>{t('common.replace')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.btn} onPress={handleCamera} activeOpacity={0.7}>
        <Text style={styles.btnEmoji}>🎥</Text>
        <Text style={styles.btnLabel}>{t('media.camera')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={handleGallery} activeOpacity={0.7}>
        <Text style={styles.btnEmoji}>🗂️</Text>
        <Text style={styles.btnLabel}>{t('media.gallery')}</Text>
      </TouchableOpacity>
    </View>
  );
}
