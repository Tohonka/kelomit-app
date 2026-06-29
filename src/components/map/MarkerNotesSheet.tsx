import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Modal, View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet} from 'react-native';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import {firstVisualMedia, mediaThumbUri} from '../../utils/mediaUtils';
import {formatTime} from '../../utils/dateUtils';
import type {Entry} from '../../types';

interface Props {
  entries: Entry[] | null;
  onSelect: (entry: Entry) => void;
  onClose: () => void;
}

const THUMB = 44;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end'},
    sheet: {
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
      maxHeight: '70%',
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    thumb: {width: THUMB, height: THUMB, borderRadius: radius.sm, backgroundColor: c.bgMuted},
    thumbPlaceholder: {alignItems: 'center', justifyContent: 'center'},
    thumbGlyph: {fontSize: 20},
    rowText: {flex: 1},
    rowTitle: {fontSize: typography.sizes.base, color: c.textPrimary},
    rowTime: {fontSize: typography.sizes.sm, color: c.textMuted},
  });

function Thumb({entry, styles}: {entry: Entry; styles: ReturnType<typeof makeStyles>}) {
  const media = firstVisualMedia(entry);
  const uri = media ? mediaThumbUri(media) : null;
  if (uri) {
    return <Image source={{uri}} style={styles.thumb} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder]}>
      <Text style={styles.thumbGlyph}>{media?.media_type === 'video' ? '🎥' : '📝'}</Text>
    </View>
  );
}

export default function MarkerNotesSheet({entries, onSelect, onClose}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={entries != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{t('gallery.notesHere')}</Text>
          <ScrollView>
            {(entries ?? []).map(entry => (
              <TouchableOpacity
                key={entry.id}
                style={styles.row}
                onPress={() => { onClose(); onSelect(entry); }}>
                <Thumb entry={entry} styles={styles} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.title || entry.location_label || formatTime(entry.created_at)}
                  </Text>
                  <Text style={styles.rowTime}>{formatTime(entry.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
