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
import WheelPicker from '../components/ui/WheelPicker';
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
import {
  scaleKcal,
  fineliToProduct,
  portionOptions,
  portionKcal,
  type PortionOption,
} from '../utils/foodMath';
import {haptic, HAPTIC_SAVE} from '../utils/haptics';
import type {RootStackScreenProps} from '../navigation/navigationTypes';
import type {FineliFood, FineliUnit, FoodProduct, FoodUnit} from '../types';

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

/** Stored unit → wheel key. Mass amounts are stored as grams. */
function unitKeyOf(unit: FoodUnit | null | undefined): string {
  return unit === 'serving' || unit === 'piece' || unit === 'ml' ? unit : 'g';
}

function fmtAmount(n: number): string {
  return String(Math.round(n * 100) / 100);
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
    amountWrap: {flex: 1, justifyContent: 'center'},
    amountInput: {textAlign: 'center', paddingRight: 40},
    amountClear: {position: 'absolute', right: 4, padding: spacing.sm},
    factorBtn: {
      minHeight: 40,
      minWidth: 44,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    factorBtnDisabled: {opacity: 0.4},
    factorText: {fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: c.textPrimary},
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
  const {entryId, prefill, date: routeDate, scan, barcode: routeBarcode} = route.params ?? {};
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
  // Product link (F2/F3): a scanned / remembered / Fineli product plus the
  // amount eaten in one of its units.
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [fineliUnits, setFineliUnits] = useState<FineliUnit[]>([]);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [amount, setAmount] = useState(prefill?.quantity != null ? fmtAmount(prefill.quantity) : '');
  const [unitKey, setUnitKey] = useState<string>(unitKeyOf(prefill?.unit));
  const [scanning, setScanning] = useState(false);
  // Name autocomplete (F3): own products first, then bundled Fineli foods.
  // Only while the user is typing — never for a prefilled/loaded name.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const unitLabels = useMemo(() => ({piece: t('food.unitPiece'), serving: t('food.unitServing')}), [t]);
  const options: PortionOption[] = useMemo(
    () => portionOptions(product, fineliUnits, FINELI_UNIT_LABELS, lang, unitLabels),
    [product, fineliUnits, lang, unitLabels],
  );
  const option = options.find(o => o.key === unitKey) ?? options[0];

  useEffect(() => {
    ensureMediaDir().catch(() => {});
  }, []);

  // Fineli products carry their household units; load them once per link.
  useEffect(() => {
    if (product?.source === 'fineli' && product.source_ref) {
      getFineliUnits(Number(product.source_ref)).then(setFineliUnits).catch(() => setFineliUnits([]));
    } else {
      setFineliUnits([]);
    }
  }, [product]);

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
        setAmount(e.quantity != null ? fmtAmount(e.quantity) : '');
        setUnitKey(unitKeyOf(e.unit));
        if (e.product_id != null) { setProduct(await getProduct(e.product_id)); }
      }
      setLoading(false);
    });
  }, [entryId, prefill?.product_id]);

  const parsedKcal = (): number | null => {
    const n = parseFloat(kcal);
    return kcal.trim() && Number.isFinite(n) ? Math.round(n) : null;
  };

  const recompute = (p: FoodProduct | null, qty: number | null, opt: PortionOption | undefined) => {
    if (!p || qty == null || !opt) { return; }
    const k = portionKcal(p.kcal_per_100, opt, qty);
    if (k != null) { setKcal(String(k)); }
  };

  // ×½ / ×2 scale kcal and the amount together.
  const applyFactor = (factor: number) => {
    const next = scaleKcal(parsedKcal(), factor);
    if (next == null) { return; }
    setKcal(String(next));
    setAmount(q => {
      const n = parsePositive(q);
      return n == null ? q : fmtAmount(n * factor);
    });
  };

  const link = (p: FoodProduct) => {
    setProduct(p);
    setPendingBarcode(null);
    setSuggestOpen(false);
    setSuggestions([]);
    setName(prev => (prev.trim() ? prev : p.brand ? `${p.brand} ${p.name}` : p.name));
    // Default amount: one serving when the product knows one, else 100 g.
    const opts = portionOptions(p, [], FINELI_UNIT_LABELS, lang, unitLabels);
    const knowsServing = p.serving_g != null || p.kcal_per_serving != null;
    const opt = opts.find(o => o.key === (knowsServing ? 'serving' : 'g')) ?? opts[0];
    const qty = knowsServing ? 1 : 100;
    setUnitKey(opt.key);
    setAmount(String(qty));
    recompute(p, qty, opt);
  };

  const unlink = () => {
    setProduct(null);
    setPendingBarcode(null);
    setAmount('');
    setUnitKey('g');
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
  // `barcode` = a code the food widget already scanned: skip the camera, once.
  const startScan = async (barcode?: string) => {
    if (scanning) { return; }
    setScanning(true);
    try {
      const code = barcode ?? (await scanBarcode());
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
    if ((scan || routeBarcode) && !autoScanned.current) {
      autoScanned.current = true;
      startScan(routeBarcode);
    }
    // startScan is recreated every render; `scan` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, routeBarcode]);

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
      // Units with a mass are stored as grams so the row stays meaningful
      // whatever unit list the product shows later; ml stays ml; a mass-less
      // piece / serving is stored as a count. Works without a product too.
      const n = parsePositive(amount);
      let qty: number | null = null;
      let u: FoodUnit | null = null;
      if (n != null && option) {
        if (option.key === 'ml') { qty = n; u = 'ml'; }
        else if (option.grams != null) { qty = n * option.grams; u = 'g'; }
        else { qty = n; u = option.key === 'piece' ? 'piece' : 'serving'; }
      }
      if (!productId && pendingBarcode) {
        // "Add once, use later": the manual entry becomes a remembered product.
        const created = await upsertProduct({
          barcode: pendingBarcode,
          name: finalName,
          brand: null,
          // The typed kcal is for the whole amount; the product remembers one unit.
          kcal_per_100: finalKcal != null && qty != null && (u === 'g' || u === 'ml') ? Math.round((finalKcal / qty) * 100) : null,
          kcal_per_serving: finalKcal != null && qty != null && (u === 'piece' || u === 'serving') ? Math.round(finalKcal / qty) : finalKcal != null && qty == null ? finalKcal : null,
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
        if (qty == null) { qty = 1; u = 'serving'; }
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

  const factorButtons = (
    <>
      <TouchableOpacity
        style={[styles.factorBtn, !hasKcal && styles.factorBtnDisabled]}
        disabled={!hasKcal}
        onPress={() => applyFactor(0.5)}>
        <Text style={styles.factorText}>×½</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.factorBtn, !hasKcal && styles.factorBtnDisabled]}
        disabled={!hasKcal}
        onPress={() => applyFactor(2)}>
        <Text style={styles.factorText}>×2</Text>
      </TouchableOpacity>
    </>
  );

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
            <Icon name={product.source === 'fineli' ? 'database-outline' : 'barcode'} size={20} color={colors.primary} />
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
          onPress={() => startScan()}
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
        autoFocus={!isEdit && !prefill && !scan && !routeBarcode}
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

      <Text style={styles.sectionLabel}>{t('food.quantity')}</Text>
      <View style={styles.row}>
        <View style={styles.amountWrap}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={q => {
              setAmount(q);
              recompute(product, parsePositive(q), option);
            }}
            placeholder="–"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            maxLength={7}
          />
          {amount.length > 0 && (
            <TouchableOpacity
              style={styles.amountClear}
              onPress={() => setAmount('')}
              accessibilityLabel={t('common.clear')}
              hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <WheelPicker
          // Remount when the unit list changes length (product linked/unlinked):
          // the wheel's row index is only meaningful for one list.
          key={options.length}
          options={options}
          value={option?.key ?? 'g'}
          onChange={key => {
            setUnitKey(key);
            recompute(product, parsePositive(amount), options.find(o => o.key === key));
          }}
        />
      </View>

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
        {factorButtons}
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
