import React, {useMemo, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {Animated, Modal, View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {useTheme, typography, spacing} from '../../theme';
import type {Colors} from '../../theme';
import {fileUri} from '../../utils/mediaUtils';

interface Props {
  /** Local file path/uri of the image to show, or null when closed. */
  uri: string | null;
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
    hint: {color: c.textMuted, fontSize: typography.sizes.xs, textAlign: 'center', paddingBottom: spacing.md},
  });

/** Full-screen pinch-to-zoom / pan / double-tap-reset image viewer. JS-driven
 *  Animated (no Reanimated). Reused by the gallery and the entry detail view. */
export default function ZoomableImageModal({uri, onClose}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [missing, setMissing] = React.useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const cur = useRef({scale: 1});
  const saved = useRef({scale: 1, tx: 0, ty: 0});

  const reset = () => {
    cur.current = {scale: 1};
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
        if (cur.current.scale <= 1) { return; }
        tx.setValue(saved.current.tx + e.translationX);
        ty.setValue(saved.current.ty + e.translationY);
      })
      .onEnd(e => {
        if (cur.current.scale <= 1) { return; }
        saved.current.tx += e.translationX;
        saved.current.ty += e.translationY;
      });
    const doubleTap = Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd(reset);
    return Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    reset();
    setMissing(false);
    onClose();
  };

  return (
    <Modal visible={uri != null} animationType="fade" onRequestClose={handleClose} transparent={false}>
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
      </View>
    </Modal>
  );
}
