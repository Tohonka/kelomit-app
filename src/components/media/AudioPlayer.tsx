import React, {useMemo, useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, type ViewStyle} from 'react-native';
import audioRecorderPlayer from 'react-native-audio-recorder-player';
import type {PlayBackType} from 'react-native-audio-recorder-player';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';

interface Props {
  filePath: string;
  durationSec?: number | null;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    playBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playIcon: {fontSize: 18, color: '#fff'},
    info: {flex: 1, gap: spacing.xs},
    progressBar: {
      height: 4,
      backgroundColor: c.bgMuted,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 2,
    },
    time: {fontSize: typography.sizes.xs, color: c.textMuted},
  });

function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function AudioPlayer({filePath, durationSec}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const totalSec = durationSec ?? 0;
  const progressStyle = useMemo<ViewStyle>(
    () => ({
      width: totalSec > 0 ? `${Math.min((positionSec / totalSec) * 100, 100)}%` : '0%',
    }),
    [positionSec, totalSec],
  );

  useEffect(() => {
    return () => { audioRecorderPlayer.stopPlayer().catch(() => {}); };
  }, []);

  const toggle = async () => {
    if (playing) {
      await audioRecorderPlayer.stopPlayer();
      audioRecorderPlayer.removePlayBackListener();
      setPlaying(false);
    } else {
      setPlaying(true);
      await audioRecorderPlayer.startPlayer(filePath);
      audioRecorderPlayer.addPlayBackListener((e: PlayBackType) => {
        setPositionSec(Math.floor(e.currentPosition / 1000));
        if (e.currentPosition >= e.duration) {
          setPlaying(false);
          audioRecorderPlayer.stopPlayer().catch(() => {});
          setPositionSec(0);
        }
      });
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playBtn} onPress={toggle}>
        <Text style={styles.playIcon}>{playing ? '⏹' : '▶'}</Text>
      </TouchableOpacity>
      <View style={styles.info}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              progressStyle,
            ]}
          />
        </View>
        <Text style={styles.time}>
          {fmt(positionSec)}{totalSec > 0 ? ` / ${fmt(totalSec)}` : ''}
        </Text>
      </View>
    </View>
  );
}
