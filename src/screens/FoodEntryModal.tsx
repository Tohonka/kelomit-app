import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import TimePicker from '../components/ui/TimePicker';
import {capturePhoto} from '../utils/mediaCapture';
import {deleteMediaFile, ensureMediaDir, fileUri} from '../utils/mediaUtils';
import {getLastKnownPosition} from '../services/gpsService';
import {createFoodEntry, getFoodEntry, updateFoodEntry} from '../db/food';
import {getOrCreateDay} from '../db/days';
import {formatDate, todayDate, localDateOf} from '../utils/dateUtils';
import {scaleKcal} from '../utils/foodMath';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {FoodUnit} from '../types';

type Props = RootStackScreenProps<'FoodEntryModal'>;

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Combine a YYYY-MM-DD date with an hour/minute into a local-time ISO string. */
function combineDateTime(dateStr: string, hours: number, minutes: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

interface Photo {
  file_path: string;
  thumbnail_path: string | null;
}
interface Linked {
  product_id: number | null;
  quantity: number | null;
  unit: FoodUnit | null;
}

const PHOTO = 120;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: c.bg},
    content: {padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm},
    sectionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.sizes.base,
      color: c.textPrimary,
      minHeight: 48,
    },
    inputMultiline: {minHeight: 80},
    row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
    flex1: {flex: 1},
    chip: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipDisabled: {opacity: 0.4},
    chipText: {fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: c.textPrimary},
    dateBtn: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
    },
    dateText: {fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: c.textPrimary},
    photoTile: {
      width: PHOTO,
      height: PHOTO,
      borderRadius: radius.md,
      backgroundColor: c.bgMuted,
      overflow: 'hidden',
    },
    photoImage: {width: PHOTO, height: PHOTO},
    remove: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#000a',
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {color: '#fff', fontSize: 15, lineHeight: 17},
    addBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
      gap: 2,
      backgroundColor: c.bgCard,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    addEmoji: {fontSize: 22},
    addLabel: {fontSize: typography.sizes.xs, color: c.textSecondary, fontWeight: typography.weights.medium},
    saveRow: {marginTop: spacing.xl},
  });

export default function FoodEntryModal({navigation, route}: Props) {
  const {entryId, prefill, date: routeDate} = route.params ?? {};
  const isEdit = entryId != null;
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // eaten_at defaults to now; a new entry on another day gets now's clock time
  // on that day (same rule as AddEntryModal duration entries).
  const [eatenAt, setEatenAt] = useState<string>(() => {
    const now = new Date();
    if (!routeDate || routeDate === todayDate()) { return now.toISOString(); }
    return combineDateTime(routeDate, now.getHours(), now.getMinutes());
  });
  const [name, setName] = useState(prefill?.name ?? '');
  const [kcal, setKcal] = useState(prefill?.kcal != null ? String(prefill.kcal) : '');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [linked, setLinked] = useState<Linked>({
    product_id: prefill?.product_id ?? null,
    quantity: prefill?.quantity ?? null,
    unit: prefill?.unit ?? null,
  });
  const [loading, setLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    ensureMediaDir().catch(() => {});
  }, []);

  useEffect(() => {
    if (entryId == null) { return; }
    getFoodEntry(entryId).then(e => {
      if (e) {
        setName(e.name);
        setKcal(e.kcal != null ? String(e.kcal) : '');
        setEatenAt(e.eaten_at);
        setNote(e.note ?? '');
        setPhoto(e.file_path ? {file_path: e.file_path, thumbnail_path: e.thumbnail_path} : null);
        setLinked({product_id: e.product_id, quantity: e.quantity, unit: e.unit});
      }
      setLoading(false);
    });
  }, [entryId]);

  const parsedKcal = (): number | null => {
    const n = parseFloat(kcal);
    return kcal.trim() && Number.isFinite(n) ? Math.round(n) : null;
  };

  // ×½ / ×2 scale the number directly; a linked quantity follows so a later
  // product-based recompute (F2+) stays consistent.
  const applyFactor = (factor: number) => {
    const next = scaleKcal(parsedKcal(), factor);
    if (next == null) { return; }
    setKcal(String(next));
    setLinked(l => ({...l, quantity: l.quantity != null ? l.quantity * factor : null}));
  };

  const takePhoto = async (fromGallery: boolean) => {
    try {
      const m = await capturePhoto(fromGallery);
      if (!m) { return; }
      if (photo) { setRemovedPhotos(r => [...r, photo.file_path]); }
      setPhoto({file_path: m.file_path, thumbnail_path: m.thumbnail_path});
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  };

  const removePhoto = () => {
    if (!photo) { return; }
    setRemovedPhotos(r => [...r, photo.file_path]);
    setPhoto(null);
  };

  const canSave = name.trim().length > 0 || photo != null;

  const handleSave = async () => {
    if (!canSave) { return; }
    setIsSaving(true);
    try {
      const day = await getOrCreateDay(localDateOf(eatenAt));
      const fields = {
        day_id: day.id,
        eaten_at: eatenAt,
        name: name.trim() || t('food.photoPlaceholder'),
        kcal: parsedKcal(),
        product_id: linked.product_id,
        quantity: linked.quantity,
        unit: linked.unit,
        note: note.trim() || null,
        file_path: photo?.file_path ?? null,
        thumbnail_path: photo?.thumbnail_path ?? null,
      };
      if (isEdit && entryId != null) {
        await updateFoodEntry(entryId, fields);
      } else {
        const gps = getLastKnownPosition();
        await createFoodEntry({
          ...fields,
          latitude: gps?.latitude ?? null,
          longitude: gps?.longitude ?? null,
        });
      }
      await Promise.all(removedPhotos.map(deleteMediaFile));
      haptic(HAPTIC_SAVE);
      navigation.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return null;
  }

  const dateStr = localDateOf(eatenAt);
  const hasKcal = kcal.trim().length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <Text style={styles.sectionLabel}>{t('food.photo')}</Text>
      {photo ? (
        <View style={styles.photoTile}>
          <Image source={{uri: fileUri(photo.thumbnail_path || photo.file_path)}} style={styles.photoImage} />
          <TouchableOpacity style={styles.remove} onPress={removePhoto} accessibilityLabel={t('common.delete')}>
            <Text style={styles.removeText}>×</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.row}>
          <TouchableOpacity style={styles.addBtn} onPress={() => takePhoto(false)}>
            <Text style={styles.addEmoji}>📷</Text>
            <Text style={styles.addLabel}>{t('media.camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => takePhoto(true)}>
            <Text style={styles.addEmoji}>🖼️</Text>
            <Text style={styles.addLabel}>{t('media.gallery')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('food.name')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('food.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        autoFocus={!isEdit && !prefill}
        maxLength={120}
      />

      <Text style={styles.sectionLabel}>{t('food.kcal')}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex1]}
          value={kcal}
          onChangeText={setKcal}
          placeholder={t('food.kcalUnit')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          maxLength={6}
        />
        <TouchableOpacity
          style={[styles.chip, !hasKcal && styles.chipDisabled]}
          disabled={!hasKcal}
          onPress={() => applyFactor(0.5)}>
          <Text style={styles.chipText}>×½</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, !hasKcal && styles.chipDisabled]}
          disabled={!hasKcal}
          onPress={() => applyFactor(2)}>
          <Text style={styles.chipText}>×2</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>{t('food.time')}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateText}>{formatDate(dateStr)}</Text>
        </TouchableOpacity>
        <TimePicker value={eatenAt} baseDate={dateStr} onChange={setEatenAt} />
      </View>
      {showDatePicker && (
        <DateTimePicker
          value={new Date(eatenAt)}
          mode="date"
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          onChange={(_e, d) => {
            setShowDatePicker(false);
            if (d) {
              const cur = new Date(eatenAt);
              setEatenAt(combineDateTime(localDateStr(d), cur.getHours(), cur.getMinutes()));
            }
          }}
        />
      )}

      <Text style={styles.sectionLabel}>{t('food.note')}</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={note}
        onChangeText={setNote}
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      <View style={styles.saveRow}>
        <Button
          label={isEdit ? t('common.update') : t('common.save')}
          onPress={handleSave}
          loading={isSaving}
          disabled={!canSave}
        />
      </View>
    </ScrollView>
  );
}
