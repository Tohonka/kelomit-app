import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, Image, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {fileUri} from '../../utils/mediaUtils';
import {capturePhoto, captureVideo, type CapturedMedia} from '../../utils/mediaCapture';
import VoiceRecorder from './VoiceRecorder';

/** Media being edited on a note: a freshly captured item, or an existing
 *  attachment (carrying its `entry_media` row id). */
export interface EditorMedia extends CapturedMedia {
  id?: number;
}

interface Props {
  media: EditorMedia[];
  onAdd: (m: EditorMedia) => void;
  onRemove: (index: number) => void;
}

const TILE = 76;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm},
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tileImage: {width: TILE, height: TILE},
    tileIcon: {fontSize: 30},
    tileLabel: {fontSize: 10, color: c.textMuted, marginTop: 2},
    remove: {
      position: 'absolute',
      top: 2,
      right: 2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: '#000a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {color: '#fff', fontSize: 13, lineHeight: 15},
    addRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    addBtn: {
      flexGrow: 1,
      flexBasis: '22%',
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      gap: 2,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    addBtnDisabled: {opacity: 0.5},
    addEmoji: {fontSize: 22},
    addLabel: {fontSize: typography.sizes.xs, color: c.textSecondary, fontWeight: typography.weights.medium},
  });

function Tile({m, label, onRemove, styles}: {m: EditorMedia; label: string; onRemove: () => void; styles: ReturnType<typeof makeStyles>}) {
  return (
    <View style={styles.tile}>
      {m.media_type === 'photo' ? (
        <Image source={{uri: fileUri(m.thumbnail_path || m.file_path)}} style={styles.tileImage} />
      ) : (
        <>
          <Text style={styles.tileIcon}>{m.media_type === 'video' ? '🎥' : '🎙️'}</Text>
          <Text style={styles.tileLabel}>{label}</Text>
        </>
      )}
      <TouchableOpacity style={styles.remove} onPress={onRemove} accessibilityLabel="remove">
        <Text style={styles.removeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AttachmentsSection({media, onAdd, onRemove}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<CapturedMedia | null>) => {
    setBusy(true);
    try {
      const m = await fn();
      if (m) { onAdd(m); }
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setBusy(false);
    }
  };

  const labelFor = (type: string) => (type === 'video' ? t('entryType.video') : t('entryType.voice'));

  return (
    <View>
      {media.length > 0 && (
        <View style={styles.grid}>
          {media.map((m, i) => (
            <Tile
              key={m.id != null ? `id-${m.id}` : `new-${i}-${m.file_path}`}
              m={m}
              label={labelFor(m.media_type)}
              onRemove={() => onRemove(i)}
              styles={styles}
            />
          ))}
        </View>
      )}

      {recording ? (
        <VoiceRecorder
          filePath={null}
          onRecord={(fp, dur) => {
            onAdd({media_type: 'voice', file_path: fp, thumbnail_path: null, duration_sec: dur});
            setRecording(false);
          }}
          onDiscard={() => setRecording(false)}
        />
      ) : (
        <View style={styles.addRow}>
          <TouchableOpacity style={[styles.addBtn, busy && styles.addBtnDisabled]} disabled={busy} onPress={() => run(() => capturePhoto(false))}>
            <Text style={styles.addEmoji}>📷</Text>
            <Text style={styles.addLabel}>{t('media.camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, busy && styles.addBtnDisabled]} disabled={busy} onPress={() => run(() => capturePhoto(true))}>
            <Text style={styles.addEmoji}>🖼️</Text>
            <Text style={styles.addLabel}>{t('media.gallery')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, busy && styles.addBtnDisabled]} disabled={busy} onPress={() => run(() => captureVideo(false))}>
            <Text style={styles.addEmoji}>🎥</Text>
            <Text style={styles.addLabel}>{t('entryType.video')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, busy && styles.addBtnDisabled]} disabled={busy} onPress={() => setRecording(true)}>
            <Text style={styles.addEmoji}>🎙️</Text>
            <Text style={styles.addLabel}>{t('entryType.voice')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
