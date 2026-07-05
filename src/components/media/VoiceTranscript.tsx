import React, {useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {EntryMedia} from '../../types';
import {transcribe, TranscriptionError} from '../../services/transcription';
import {updateEntryMedia} from '../../db/entries';

interface Props {
  media: EntryMedia;
  onChanged: () => void;            // refresh the entry after a DB write
  onNeedKey: () => void;            // navigate to Transcription settings
  onUseAsNote: (text: string) => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {marginTop: spacing.sm, gap: spacing.sm},
    transcribeBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: c.primary,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    transcribeBtnText: {color: '#fff', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm},
    label: {fontSize: typography.sizes.xs, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5},
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 60,
      textAlignVertical: 'top',
    },
    actions: {flexDirection: 'row', gap: spacing.lg, alignItems: 'center'},
    action: {fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: c.primary},
  });

export default function VoiceTranscript({media, onChanged, onNeedKey, onUseAsNote}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(media.transcript ?? '');

  const messageForError = (kind: TranscriptionError['kind']): string => {
    switch (kind) {
      case 'auth': return t('transcription.errAuth');
      case 'rate': return t('transcription.errRate');
      case 'network': return t('transcription.errNetwork');
      default: return t('transcription.errOther');
    }
  };

  const runTranscribe = async () => {
    setBusy(true);
    try {
      const result = await transcribe(media.file_path);
      await updateEntryMedia(media.id!, {transcript: result});
      setText(result);
      onChanged();
    } catch (e) {
      if (e instanceof TranscriptionError && e.kind === 'no-key') {
        Alert.alert(t('transcription.errNoKey'), undefined, [
          {text: t('common.cancel'), style: 'cancel'},
          {text: t('transcription.goToSettings'), onPress: onNeedKey},
        ]);
      } else {
        const kind = e instanceof TranscriptionError ? e.kind : 'other';
        Alert.alert(messageForError(kind));
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (text === (media.transcript ?? '')) { return; }
    await updateEntryMedia(media.id!, {transcript: text});
    onChanged();
  };

  if (!media.transcript && !busy) {
    return (
      <View style={styles.wrap}>
        <TouchableOpacity style={styles.transcribeBtn} onPress={runTranscribe}>
          <Text style={styles.transcribeBtnText}>{t('transcription.transcribe')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('transcription.transcriptLabel')}</Text>
      {busy ? (
        <View style={styles.transcribeBtn}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.transcribeBtnText}>{t('transcription.transcribing')}</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onBlur={saveEdit}
            multiline
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onUseAsNote(text)}>
              <Text style={styles.action}>{t('transcription.useAsNote')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={runTranscribe}>
              <Text style={styles.action}>{t('transcription.retranscribe')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
