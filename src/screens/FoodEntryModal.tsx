import React, {useEffect, useMemo, useRef, useState} from 'react';
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
  ToastAndroid,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import Button from '../components/ui/Button';
import TimePicker from '../components/ui/TimePicker';
import {capturePhoto} from '../utils/mediaCapture';
import {deleteMediaFile, ensureMediaDir, fileUri} from '../utils/mediaUtils';
import {getLastKnownPosition} from '../services/gpsService';
import {scanBarcode} from '../native/barcodeScanner';
import {lookupBarcode} from '../services/openFoodFacts';
import {
  createFoodEntry,
  getFoodEntry,
  getProduct,
  getProductByBarcode,
  getProductBySourceRef,
  searchProducts,
  updateFoodEntry,
  upsertProduct,
} from '../db/food';
import {FINELI_UNIT_LABELS, getFineliUnits, searchFineli} from '../db/fineli';
import {getOrCreateDay} from '../db/days';
import {formatDate, todayDate, localDateOf} from '../utils/dateUtils';
import {scaleKcal, kcalFor, defaultPortion, fineliToProduct} from '../utils/foodMath';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {FineliFood, FoodProduct, FoodUnit} from '../types';

type Suggestion = {kind: 'product'; product: FoodProduct} | {kind: 'fineli'; food: FineliFood};

type Props = RootStackScreenProps<'FoodEntryModal'>;

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Combine a YYYY-MM-DD date with an hour/minute into a local-time ISO string. */
function combineDateTime(dateStr: string, hours: number, minutes: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

function parsePositive(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
}

interface Photo {
  file_path: string;
  thumbnail_path: string | null;
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
    chipActive: {backgroundColor: c.primary, borderColor: c.primary},
    chipDisabled: {opacity: 0.4},
    chipText: {fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: c.textPrimary},
    chipTextActive: {color: c.white},
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
    addBtnDisabled: {opacity: 0.5},
    addEmoji: {fontSize: 22},
    addLabel: {fontSize: typography.sizes.xs, color: c.textSecondary, fontWeight: typography.weights.medium},
    productChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.primary,
    },
    productName: {fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: c.textPrimary},
    productHint: {fontSize: typography.sizes.xs, color: c.textMuted, marginTop: 2},
    pending: {fontSize: typography.sizes.xs, color: c.textMuted},
    suggestions: {
      backgroundColor: c.bgCard,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    suggestionName: {flex: 1, fontSize: typography.sizes.base, color: c.textPrimary},
    suggestionHint: {fontSize: typography.sizes.xs, color: c.textMuted},
    saveRow: {marginTop: spacing.xl},
  });

export default function FoodEntryModal({navigation, route}: Props) {
  const {entryId, prefill, date: routeDate, scan} = route.params ?? {};
  const isEdit = entryId != null;
  const {t, i18n} = useTranslation();
  const lang: 'fi' | 'en' = i18n.resolvedLanguage === 'fi' ? 'fi' : 'en';
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
  // Product link (F2): a scanned / remembered product plus the amount eaten.
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(prefill?.quantity != null ? String(prefill.quantity) : '');
  const [unit, setUnit] = useState<FoodUnit>(prefill?.unit ?? 'serving');
  const [scanning, setScanning] = useState(false);
  // Name autocomplete (F3): own products first, then bundled Fineli foods.
  // Only while the user is typing — never for a prefilled/loaded name.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    ensureMediaDir().catch(() => {});
  }, []);

  useEffect(() => {
    if (entryId == null) {
      if (prefill?.product_id != null) {
        getProduct(prefill.product_id).then(p => { if (p) { setProduct(p); } });
      }
      return;
    }
    getFoodEntry(entryId).then(async e => {
      if (e) {
        setName(e.name);
        setKcal(e.kcal != null ? String(e.kcal) : '');
        setEatenAt(e.eaten_at);
        setNote(e.note ?? '');
        setPhoto(e.file_path ? {file_path: e.file_path, thumbnail_path: e.thumbnail_path} : null);
        setQuantity(e.quantity != null ? String(e.quantity) : '');
        setUnit(e.unit ?? 'serving');
        if (e.product_id != null) { setProduct(await getProduct(e.product_id)); }
      }
      setLoading(false);
    });
  }, [entryId, prefill?.product_id]);

  const parsedKcal = (): number | null => {
    const n = parseFloat(kcal);
    return kcal.trim() && Number.isFinite(n) ? Math.round(n) : null;
  };

  const recompute = (p: FoodProduct, qty: number | null, u: FoodUnit) => {
    if (qty == null) { return; }
    const k = kcalFor(p, qty, u);
    if (k != null) { setKcal(String(k)); }
  };

  // ×½ / ×2 scale kcal and the amount together.
  const applyFactor = (factor: number) => {
    const next = scaleKcal(parsedKcal(), factor);
    if (next == null) { return; }
    setKcal(String(next));
    setQuantity(q => {
      const n = parsePositive(q);
      return n == null ? q : String(Math.round(n * factor * 100) / 100);
    });
  };

  const link = (p: FoodProduct) => {
    setProduct(p);
    setPendingBarcode(null);
    setSuggestOpen(false);
    setSuggestions([]);
    setName(prev => (prev.trim() ? prev : p.brand ? `${p.brand} ${p.name}` : p.name));
    const portion = defaultPortion(p);
    setQuantity(String(portion.quantity));
    setUnit(portion.unit);
    recompute(p, portion.quantity, portion.unit);
  };

  const unlink = () => {
    setProduct(null);
    setPendingBarcode(null);
    setQuantity('');
  };

  useEffect(() => {
    const q = name.trim();
    if (!suggestOpen || product || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const [own, fineli] = await Promise.all([searchProducts(q), searchFineli(q, lang)]);
        if (!active) { return; }
        const ownIds = new Set(own.map(p => p.source === 'fineli' ? p.source_ref : null));
        setSuggestions([
          ...own.map(p => ({kind: 'product', product: p}) as Suggestion),
          ...fineli
            .filter(f => !ownIds.has(String(f.id)))
            .map(f => ({kind: 'fineli', food: f}) as Suggestion),
        ]);
      } catch {
        if (active) { setSuggestions([]); }
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, suggestOpen, product, lang]);

  const pickSuggestion = async (s: Suggestion) => {
    try {
      let p: FoodProduct;
      if (s.kind === 'product') {
        p = s.product;
      } else {
        // One product row per Fineli food, created on first pick.
        const existing = await getProductBySourceRef('fineli', String(s.food.id));
        p = existing ?? (await upsertProduct(
          fineliToProduct(s.food, await getFineliUnits(s.food.id), FINELI_UNIT_LABELS, lang),
        ));
      }
      setName(p.brand ? `${p.brand} ${p.name}` : p.name);
      link(p);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  };

  // Local cache first (offline, instant), then Open Food Facts; a miss leaves the
  // barcode pending so the manual entry is remembered as a product on save.
  const startScan = async () => {
    if (scanning) { return; }
    setScanning(true);
    try {
      const code = await scanBarcode();
      if (!code) { return; }
      const local = await getProductByBarcode(code);
      if (local) { link(local); return; }
      try {
        const off = await lookupBarcode(code);
        if (off) { link(await upsertProduct(off)); return; }
        ToastAndroid.show(t('food.barcodeUnknown'), ToastAndroid.LONG);
      } catch {
        ToastAndroid.show(t('food.barcodeOffline'), ToastAndroid.LONG);
      }
      setProduct(null);
      setPendingBarcode(code);
    } catch {
      Alert.alert(t('common.error'), t('food.scanFailed'));
    } finally {
      setScanning(false);
    }
  };

  // Food tab's barcode button opens straight into the scanner — once.
  const autoScanned = useRef(false);
  useEffect(() => {
    if (scan && !autoScanned.current) {
      autoScanned.current = true;
      startScan();
    }
    // startScan is recreated every render; `scan` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

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
      const finalName = name.trim() || t('food.photoPlaceholder');
      const finalKcal = parsedKcal();
      let productId = product?.id ?? null;
      let qty = productId ? parsePositive(quantity) : null;
      let u: FoodUnit | null = productId ? unit : null;
      if (!productId && pendingBarcode) {
        // "Add once, use later": the manual entry becomes a remembered product.
        const created = await upsertProduct({
          barcode: pendingBarcode,
          name: finalName,
          brand: null,
          kcal_per_100: null,
          kcal_per_serving: finalKcal,
          protein_per_100: null,
          carbs_per_100: null,
          fat_per_100: null,
          serving_g: null,
          serving_label: null,
          source: 'user',
          source_ref: null,
          image_url: null,
        });
        productId = created.id;
        qty = 1;
        u = 'serving';
      }
      const fields = {
        day_id: day.id,
        eaten_at: eatenAt,
        name: finalName,
        kcal: finalKcal,
        product_id: productId,
        quantity: qty,
        unit: u,
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
  const units: FoodUnit[] =
    product && (product.kcal_per_serving != null || product.serving_g != null) ? ['serving', 'g'] : ['g'];

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

      {product ? (
        <>
          <Text style={styles.sectionLabel}>{t('food.product')}</Text>
          <View style={styles.productChip}>
            <Icon name="barcode" size={20} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.productName} numberOfLines={1}>
                {product.brand ? `${product.brand} · ${product.name}` : product.name}
              </Text>
              {product.kcal_per_100 != null && (
                <Text style={styles.productHint}>
                  {t('food.perHundred', {kcal: Math.round(product.kcal_per_100)})}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={unlink} accessibilityLabel={t('common.clear')} hitSlop={8}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={[styles.addBtn, scanning && styles.addBtnDisabled]}
          disabled={scanning}
          onPress={startScan}
          accessibilityLabel={t('food.scan')}>
          <Icon name="barcode-scan" size={22} color={colors.textSecondary} />
          <Text style={styles.addLabel}>{t('food.scan')}</Text>
        </TouchableOpacity>
      )}
      {!product && pendingBarcode && (
        <Text style={styles.pending}>{t('food.pendingBarcode', {code: pendingBarcode})}</Text>
      )}

      <Text style={styles.sectionLabel}>{t('food.name')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={v => {
          setName(v);
          setSuggestOpen(true);
        }}
        placeholder={t('food.namePlaceholder')}
        placeholderTextColor={colors.textMuted}
        autoFocus={!isEdit && !prefill && !scan}
        maxLength={120}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map(s => {
            const key = s.kind === 'product' ? `p-${s.product.id}` : `f-${s.food.id}`;
            const label =
              s.kind === 'product'
                ? s.product.brand ? `${s.product.brand} ${s.product.name}` : s.product.name
                : lang === 'fi' ? s.food.name_fi : s.food.name_en ?? s.food.name_fi;
            const kcal100 = s.kind === 'product' ? s.product.kcal_per_100 : s.food.kcal_per_100;
            return (
              <TouchableOpacity key={key} style={styles.suggestion} onPress={() => pickSuggestion(s)}>
                <Icon
                  name={s.kind === 'product' ? 'history' : 'database-outline'}
                  size={18}
                  color={colors.textMuted}
                />
                <Text style={styles.suggestionName} numberOfLines={1}>{label}</Text>
                <Text style={styles.suggestionHint}>
                  {s.kind === 'product' ? t('food.sourceOwn') : t('food.sourceFineli')}
                  {kcal100 != null ? ` · ${t('food.perHundred', {kcal: Math.round(kcal100)})}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {product && (
        <>
          <Text style={styles.sectionLabel}>{t('food.quantity')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex1]}
              value={quantity}
              onChangeText={q => {
                setQuantity(q);
                recompute(product, parsePositive(q), unit);
              }}
              keyboardType="numeric"
              maxLength={7}
            />
            {units.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.chip, unit === u && styles.chipActive]}
                onPress={() => {
                  setUnit(u);
                  recompute(product, parsePositive(quantity), u);
                }}>
                <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>
                  {t(u === 'g' ? 'food.unitG' : 'food.unitServing')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

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
