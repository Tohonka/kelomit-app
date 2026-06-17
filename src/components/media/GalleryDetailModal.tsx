import React, {useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Animated, Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useTheme, typography, spacing, radius} from '../../theme';
import type {Colors} from '../../theme';
import type {Entry} from '../../types';
import {fileUri} from '../../utils/mediaUtils';
import {formatTime, formatDate, localDateOf} from '../../utils/dateUtils';
import ActivityBadge from '../entries/ActivityBadge';
import ProjectChip from '../entries/ProjectChip';
import TagChip from '../entries/TagChip';

interface Props {
  entry: Entry | null;
  onClose: () => void;
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backdrop: {flex: 1, backgroundColor: '#000'},
    topBar: {flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.md},
    closeBtn: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
    closeText: {color: '#fff', fontSize: 26, lineHeight: 28},
    imageWrap: {flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
    image: {width: '100%', height: '100%'},
    missing: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
    missingIcon: {fontSize: 48},
    missingText: {color: c.textMuted, fontSize: typography.sizes.sm},
    info: {
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      maxHeight: 240,
    },
    metaRow: {flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm},
    title: {fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: c.textPrimary, marginBottom: spacing.xs},
    body: {fontSize: typography.sizes.base, color: c.textSecondary, lineHeight: 21, marginBottom: spacing.sm},
    sub: {fontSize: typography.sizes.sm, color: c.textMuted},
    tags: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm},
    hint: {color: c.textMuted, fontSize: typography.sizes.xs, textAlign: 'center', paddingBottom: spacing.xs},
  });

export default function GalleryDetailModal({entry, onClose}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [missing, setMissing] = useState(false);

  // Pinch-to-zoom + pan, JS-driven (no Reanimated). Double-tap resets.
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const cur = useRef({scale: 1, tx: 0, ty: 0});
  const saved = useRef({scale: 1, tx: 0, ty: 0});

  const reset = () => {
    cur.current = {scale: 1, tx: 0, ty: 0};
    saved.current = {scale: 1, tx: 0, ty: 0};
    Animated.spring(scale, {toValue: 1, useNativeDriver: false, bounciness: 0}).start();
    Animated.spring(tx, {toValue: 0, useNativeDriver: false, bounciness: 0}).start();
    Animated.spring(ty, {toValue: 0, useNativeDriver: false, bounciness: 0}).start();
  };

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onUpdate(e => {
        const s = Math.max(1, saved.current.scale * e.scale);
        cur.current.scale = s;
        scale.setValue(s);
      })
      .onEnd(() => {
        saved.current.scale = cur.current.scale;
        if (cur.current.scale <= 1.01) { reset(); }
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .averageTouches(true)
      .onUpdate(e => {
        if (cur.current.scale <= 1) { return; } // only pan when zoomed in
        tx.setValue(saved.current.tx + e.translationX);
        ty.setValue(saved.current.ty + e.translationY);
      })
      .onEnd(e => {
        if (cur.current.scale <= 1) { return; }
        saved.current.tx += e.translationX;
        saved.current.ty += e.translationY;
        cur.current.tx = saved.current.tx;
        cur.current.ty = saved.current.ty;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(reset);

    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
    // refs keep this stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = entry != null;
  const uri = entry ? entry.file_path || entry.thumbnail_path : null;

  const handleClose = () => {
    reset();
    setMissing(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose} transparent={false}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} accessibilityLabel={t('common.close')}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        {uri && !missing ? (
          <GestureDetector gesture={gesture}>
            <View style={styles.imageWrap}>
              <Animated.Image
                source={{uri: fileUri(uri)}}
                resizeMode="contain"
                onError={() => setMissing(true)}
                style={[styles.image, {transform: [{translateX: tx}, {translateY: ty}, {scale}]}]}
              />
            </View>
          </GestureDetector>
        ) : (
          <View style={styles.missing}>
            <Text style={styles.missingIcon}>🖼️</Text>
            <Text style={styles.missingText}>{t('gallery.fileMissing')}</Text>
          </View>
        )}

        {uri && !missing && <Text style={styles.hint}>{t('gallery.zoomHint')}</Text>}

        {entry && (
          <View style={styles.info}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.metaRow}>
                <ActivityBadge type={entry.activity_type} />
                {entry.project ? <ProjectChip project={entry.project} /> : null}
              </View>
              {entry.title ? <Text style={styles.title}>{entry.title}</Text> : null}
              {entry.body ? <Text style={styles.body}>{entry.body}</Text> : null}
              <Text style={styles.sub}>
                {formatDate(localDateOf(entry.created_at))} · {formatTime(entry.created_at)}
                {entry.location_label ? ` · ${entry.location_label}` : ''}
              </Text>
              {(entry.tags ?? []).length > 0 ? (
                <View style={styles.tags}>
                  {(entry.tags ?? []).map(tag => <TagChip key={tag.id} name={tag.name} />)}
                </View>
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}
