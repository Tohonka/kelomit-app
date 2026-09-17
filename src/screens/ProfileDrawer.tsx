import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {startOfWeek, format} from 'date-fns';
import {shouldDismiss} from '../components/quickadd/sheetGesture';
import {getWorkSecondsByDay} from '../db/entries';
import {getHealthDaily} from '../db/health';
import {loadEnergyRange, type EnergyRange} from '../services/energy';
import {useSettingsStore} from '../store/settingsStore';
import {capturePhoto} from '../utils/mediaCapture';
import {deleteMediaFile, fileUri} from '../utils/mediaUtils';
import {todayDate} from '../utils/dateUtils';
import {formatHours} from '../utils/hoursUtils';
import {useTheme, typography, spacing, radius} from '../theme';
import type {Colors} from '../theme';
import type {RootStackParamList, RootStackScreenProps} from '../navigation/navigationTypes';
import type {HealthDaily} from '../types';

type Props = RootStackScreenProps<'ProfileDrawer'>;

const AVATAR = 72;

const LINKS: {route: keyof RootStackParamList & ('HealthSettings' | 'WidgetSettings' | 'DataSettings'); icon: string; labelKey: string}[] = [
  {route: 'HealthSettings', icon: 'heart-pulse', labelKey: 'health.title'},
  {route: 'WidgetSettings', icon: 'widgets-outline', labelKey: 'profile.widgets'},
  {route: 'DataSettings', icon: 'database-outline', labelKey: 'profile.data'},
];

const makeStyles = (c: Colors, bottom: number) =>
  StyleSheet.create({
    root: {flex: 1, justifyContent: 'flex-end'},
    scrim: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#00000088'},
    sheet: {
      flexShrink: 1,
      backgroundColor: c.bgCard,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.glassBorder,
    },
    grabZone: {alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.md},
    grabber: {width: 44, height: 5, borderRadius: 3, backgroundColor: c.textMuted, opacity: 0.6},
    content: {paddingHorizontal: spacing.lg, paddingBottom: bottom + spacing.xl, gap: spacing.md},
    head: {flexDirection: 'row', alignItems: 'center', gap: spacing.lg},
    avatar: {width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: c.swatch},
    avatarEmpty: {alignItems: 'center', justifyContent: 'center'},
    avatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    flex1: {flex: 1},
    name: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: c.textPrimary,
      paddingVertical: 4,
    },
    body: {fontSize: typography.sizes.sm, color: c.textMuted},
    tiles: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
    tile: {
      flexGrow: 1,
      flexBasis: '30%',
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      gap: 2,
    },
    tileValue: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: c.textPrimary},
    tileLabel: {fontSize: typography.sizes.xs, color: c.textMuted},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    rowText: {flex: 1, fontSize: typography.sizes.base, color: c.textPrimary, fontWeight: typography.weights.medium},
  });

/** The user's corner of the app: who, the day's own numbers, and the way into
 *  Settings. A transparent stack screen rather than an RN <Modal>, so the
 *  drag-to-dismiss gesture needs no GestureHandlerRootView of its own. */
export default function ProfileDrawer({navigation}: Props) {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);
  const {
    profile_name, profile_photo, body_weight_kg, body_height_cm, birth_year,
    weekly_target_hours, setBodyProfile,
  } = useSettingsStore();
  const [name, setName] = useState(profile_name);
  const [energy, setEnergy] = useState<EnergyRange | null>(null);
  const [weekSecs, setWeekSecs] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthDaily | null>(null);

  useEffect(() => {
    const today = todayDate();
    const monday = format(startOfWeek(new Date(), {weekStartsOn: 1}), 'yyyy-MM-dd');
    loadEnergyRange(today, today).then(setEnergy).catch(() => {});
    getWorkSecondsByDay(monday, today)
      .then(byDay => setWeekSecs(Object.values(byDay).reduce((s, v) => s + v, 0)))
      .catch(() => {});
    getHealthDaily(today).then(setHealth).catch(() => {});
  }, []);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  // Drag the grabber down to dismiss; same release rule as the quick-add sheet.
  const dragY = useSharedValue(0);
  const sheetHeight = height * 0.88;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onUpdate(e => { dragY.value = Math.max(0, e.translationY); })
        .onEnd(e => {
          if (shouldDismiss(e.translationY, e.velocityY, sheetHeight)) { close(); }
          else { dragY.value = withTiming(0, {duration: 160}); }
        }),
    [close, dragY, sheetHeight],
  );
  const dragStyle = useAnimatedStyle(() => ({transform: [{translateY: dragY.value}]}));

  const pickPhoto = async () => {
    try {
      const picked = await capturePhoto(true);
      if (!picked) { return; }
      const old = profile_photo;
      await setBodyProfile({profile_photo: picked.file_path});
      if (old) { await deleteMediaFile(old); }
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  };

  const today = energy?.days[0];
  const age = birth_year != null ? new Date().getFullYear() - birth_year : null;
  const bodyLine = [
    body_weight_kg != null ? `${body_weight_kg} kg` : null,
    body_height_cm != null ? `${body_height_cm} cm` : null,
    age != null ? t('profile.age', {n: age}) : null,
  ].filter(Boolean).join(' · ');

  const tiles: {label: string; value: string}[] = [];
  if (energy?.bmr != null) { tiles.push({label: t('energy.bmr'), value: String(energy.bmr)}); }
  if (today) {
    tiles.push({label: t('energy.usedSoFar'), value: `≈ ${today.totalKcal}`});
    tiles.push({label: t('energy.eaten'), value: today.eatenKcal != null ? String(today.eatenKcal) : '–'});
  }
  if (weekSecs != null) {
    tiles.push({label: t('profile.weekHours', {target: weekly_target_hours}), value: formatHours(weekSecs)});
  }
  if (health?.steps != null) { tiles.push({label: t('balance.steps'), value: String(Math.round(health.steps))}); }
  if (health?.sleep_minutes != null) {
    tiles.push({
      label: t('balance.sleep'),
      value: `${Math.floor(health.sleep_minutes / 60)} h ${String(health.sleep_minutes % 60).padStart(2, '0')}`,
    });
  }

  return (
    <View style={styles.root}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel={t('common.close')} />
      <Animated.View style={[styles.sheet, {maxHeight: sheetHeight}, dragStyle]}>
        <GestureDetector gesture={pan}>
          <View style={styles.grabZone}>
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <TouchableOpacity onPress={pickPhoto} accessibilityLabel={t('profile.changePhoto')}>
              {profile_photo ? (
                <Image source={{uri: fileUri(profile_photo)}} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Icon name="account" size={40} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Icon name="camera-outline" size={15} color={colors.white} />
              </View>
            </TouchableOpacity>
            <View style={styles.flex1}>
              <TextInput
                style={styles.name}
                value={name}
                // Saved as typed: every way out of the drawer unmounts without a blur.
                onChangeText={v => {
                  setName(v);
                  setBodyProfile({profile_name: v.trim()}).catch(() => {});
                }}
                placeholder={t('profile.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={40}
              />
              <Text style={styles.body} onPress={() => navigation.replace('HealthSettings')}>
                {bodyLine || t('profile.addBody')}
              </Text>
            </View>
          </View>

          {tiles.length > 0 && (
            <View style={styles.tiles}>
              {tiles.map(tile => (
                <View key={tile.label} style={styles.tile}>
                  <Text style={styles.tileValue}>{tile.value}</Text>
                  <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
                </View>
              ))}
            </View>
          )}

          <View>
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.popTo('MainTabs', {screen: 'Settings'})}>
              <Icon name="cog-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.rowText}>{t('common.settings')}</Text>
              <Icon name="chevron-right" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            {LINKS.map(l => (
              <TouchableOpacity key={l.route} style={styles.row} onPress={() => navigation.replace(l.route)}>
                <Icon name={l.icon} size={22} color={colors.textSecondary} />
                <Text style={styles.rowText}>{t(l.labelKey)}</Text>
                <Icon name="chevron-right" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
