import React, {useMemo, useState, useEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {NitroAudioRecord} from 'react-native-nitro-audio-record';
import RNFS from 'react-native-fs';
import audioRecorderPlayer from 'react-native-nitro-sound';
import type {PlayBackType} from 'react-native-nitro-sound';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {ensureMicrophonePermission} from '../../services/permissionService';
import {makeMediaPath, ensureMediaDir} from '../../utils/mediaUtils';

interface Props {
  filePath: string | null;
  onRecord: (filePath: string, durationSec: number) => void;
  onDiscard: () => void;
  /** Start recording immediately on mount (widget voice flow). */
  autoStart?: boolean;
}

type RecordState = 'idle' | 'recording' | 'done';

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    startBtn: {
      paddingVertical: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      gap: spacing.sm,
    },
    startEmoji: {fontSize: 36},
    startLabel: {
      fontSize: typography.sizes.base,
      color: c.textSecondary,
      fontWeight: typography.weights.medium,
    },
    card: {
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      gap: spacing.md,
    },
    recordingDot: {fontSize: 28, color: c.error},
    timer: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      letterSpacing: 2,
    },
    stopBtn: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.error,
    },
    stopBtnText: {
      color: '#fff',
      fontWeight: typography.weights.bold,
      fontSize: typography.sizes.base,
    },
    doneIcon: {fontSize: 32},
    doneText: {fontSize: typography.sizes.base, color: c.textSecondary},
    doneActions: {flexDirection: 'row', gap: spacing.lg, alignItems: 'center'},
    playBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
    },
    playBtnText: {
      color: '#fff',
      fontWeight: typography.weights.semibold,
      fontSize: typography.sizes.sm,
    },
    discardText: {
      color: c.error,
      fontWeight: typography.weights.medium,
      fontSize: typography.sizes.sm,
    },
  });

export default function VoiceRecorder({filePath, onRecord, onDiscard, autoStart}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<RecordState>(filePath ? 'done' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const elapsedRef = useRef(0);
  // The path we want the file to end up at. NitroAudioRecord always saves under
  // its own document-dir wavFile name; stop() resolves with that real path, which
  // we then move to `recordPathRef.current` (our media dir) for consistent storage.
  const recordPathRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      NitroAudioRecord.stop().catch(() => {});
      audioRecorderPlayer.stopPlayer().catch(() => {});
    };
  }, []);

  // Widget flow: begin recording as soon as the recorder mounts. One-shot —
  // a discard must not re-trigger it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStarted.current && state === 'idle') {
      autoStarted.current = true;
      startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const startRecording = async () => {
    const ok = await ensureMicrophonePermission();
    if (!ok) { return; }
    try {
      await ensureMediaDir();
      const path = makeMediaPath('voice', 'wav');
      recordPathRef.current = path;
      // ponytail: single active recording at a time (one VoiceRecorder mounts
      // per add-entry flow), so a unique per-take filename is enough — no locking.
      // Unique name means a failed move (below) leaves a recoverable, non-clobbered file.
      NitroAudioRecord.setup({
        sampleRate: 16000,
        channels: 1,
        bitsPerSample: 16,
        wavFile: `kelomit_rec_${Date.now()}.wav`,
      });
      NitroAudioRecord.start();
      elapsedRef.current = 0;
      setElapsed(0);
      tickRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
      setState('recording');
    } catch (e) {
      Alert.alert(t('media.recordingError'), String(e));
    }
  };

  const stopRecording = async () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    let producedPath: string;
    try {
      producedPath = await NitroAudioRecord.stop(); // saved wav path
    } catch (e) {
      Alert.alert(t('media.stopRecordingError'), String(e));
      return;
    }
    const src = producedPath.replace('file://', '');
    const dest = recordPathRef.current!;
    // Move the recorder's output into our media dir (consistent storage). If the
    // move fails, keep the recorder's own uniquely-named WAV rather than losing
    // the take the user just recorded — it's a valid file either way.
    let finalPath = dest;
    try {
      if (src !== dest) {
        if (await RNFS.exists(dest)) { await RNFS.unlink(dest); }
        await RNFS.moveFile(src, dest);
      }
    } catch {
      finalPath = src;
    }
    setState('done');
    onRecord(finalPath, elapsedRef.current);
  };

  const togglePlay = async () => {
    if (!filePath) { return; }
    if (isPlaying) {
      await audioRecorderPlayer.stopPlayer();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      await audioRecorderPlayer.startPlayer(filePath);
      audioRecorderPlayer.addPlayBackListener((e: PlayBackType) => {
        if (e.currentPosition >= e.duration) {
          setIsPlaying(false);
          audioRecorderPlayer.stopPlayer().catch(() => {});
        }
      });
    }
  };

  const discard = async () => {
    await audioRecorderPlayer.stopPlayer().catch(() => {});
    setIsPlaying(false);
    setState('idle');
    onDiscard();
    elapsedRef.current = 0;
    setElapsed(0);
  };

  if (state === 'recording') {
    return (
      <View style={styles.card}>
        <Text style={styles.recordingDot}>⏺</Text>
        <Text style={styles.timer}>{fmtTime(elapsed)}</Text>
        <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
          <Text style={styles.stopBtnText}>{t('common.stop')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'done' && filePath) {
    return (
      <View style={styles.card}>
        <Text style={styles.doneIcon}>🎙️</Text>
        <Text style={styles.doneText}>
          {t('media.recordingSaved')}{elapsed > 0 ? ` · ${fmtTime(elapsed)}` : ''}
        </Text>
        <View style={styles.doneActions}>
          <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
            <Text style={styles.playBtnText}>
              {isPlaying ? `⏹ ${t('common.stop')}` : `▶ ${t('media.play')}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={discard}>
            <Text style={styles.discardText}>{t('common.discard')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.startBtn} onPress={startRecording} activeOpacity={0.7}>
      <Text style={styles.startEmoji}>🎙️</Text>
      <Text style={styles.startLabel}>{t('media.tapToRecord')}</Text>
    </TouchableOpacity>
  );
}
