import React, {useMemo, useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import audioRecorderPlayer from 'react-native-audio-recorder-player';
import type {RecordBackType, PlayBackType} from 'react-native-audio-recorder-player';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {ensureMicrophonePermission} from '../../services/permissionService';
import {makeMediaPath, ensureMediaDir} from '../../utils/mediaUtils';

interface Props {
  filePath: string | null;
  onRecord: (filePath: string, durationSec: number) => void;
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

export default function VoiceRecorder({filePath, onRecord}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState<RecordState>(filePath ? 'done' : 'idle');
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRecorderPlayer.stopRecorder().catch(() => {});
      audioRecorderPlayer.stopPlayer().catch(() => {});
    };
  }, []);

  const startRecording = async () => {
    const ok = await ensureMicrophonePermission();
    if (!ok) { return; }
    try {
      await ensureMediaDir();
      const path = makeMediaPath('voice', 'm4a');
      await audioRecorderPlayer.startRecorder(path);
      audioRecorderPlayer.addRecordBackListener((e: RecordBackType) => {
        setElapsed(Math.floor(e.currentPosition / 1000));
      });
      setState('recording');
    } catch (e) {
      Alert.alert('Recording error', String(e));
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setState('done');
      onRecord(result, elapsed);
    } catch (e) {
      Alert.alert('Stop recording error', String(e));
    }
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
    setElapsed(0);
  };

  if (state === 'recording') {
    return (
      <View style={styles.card}>
        <Text style={styles.recordingDot}>⏺</Text>
        <Text style={styles.timer}>{fmtTime(elapsed)}</Text>
        <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
          <Text style={styles.stopBtnText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'done' && filePath) {
    return (
      <View style={styles.card}>
        <Text style={styles.doneIcon}>🎙️</Text>
        <Text style={styles.doneText}>
          Recording saved{elapsed > 0 ? ` · ${fmtTime(elapsed)}` : ''}
        </Text>
        <View style={styles.doneActions}>
          <TouchableOpacity style={styles.playBtn} onPress={togglePlay}>
            <Text style={styles.playBtnText}>{isPlaying ? '⏹ Stop' : '▶ Play'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={discard}>
            <Text style={styles.discardText}>Discard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.startBtn} onPress={startRecording} activeOpacity={0.7}>
      <Text style={styles.startEmoji}>🎙️</Text>
      <Text style={styles.startLabel}>Tap to record</Text>
    </TouchableOpacity>
  );
}
