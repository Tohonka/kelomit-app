import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {startTracking, stopTracking} from '../../services/gpsService';
import {ensureBackgroundLocationPermission, ensureActivityRecognitionPermission} from '../../services/permissionService';
import {requestNotificationPermission} from '../../services/notificationService';
import {useTheme} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';

export default function TrackingSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const {
    gps_enabled, setGpsEnabled, gps_interval_ms, default_activity_type,
    background_tracking, setBackgroundTracking,
  } = useSettingsStore();

  const handleGpsToggle = async () => {
    const next = !gps_enabled;
    await setGpsEnabled(next);
    if (next) {
      startTracking(gps_interval_ms);
    } else {
      stopTracking();
    }
  };

  const handleBackgroundToggle = async () => {
    const next = !background_tracking;
    if (next) {
      // Needs "Allow all the time" — bail out (with a hint) if not granted.
      const ok = await ensureBackgroundLocationPermission();
      if (!ok) { return; }
      await setBackgroundTracking(true);
      // The keep-alive notification needs POST_NOTIFICATIONS on Android 13+.
      requestNotificationPermission().catch(() => {});
      // Optional: lets the parked service wake fast on movement (geofence is the
      // fallback if denied), so we don't block the toggle on it.
      ensureActivityRecognitionPermission().catch(() => {});
    } else {
      await setBackgroundTracking(false);
    }
    // Restart tracking so the native source is added/removed to match the toggle
    // (the JS watch baseline runs either way).
    if (gps_enabled) { stopTracking(); startTracking(gps_interval_ms); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>{t('settings.location')}</Text>

        <TouchableOpacity style={styles.row} onPress={handleGpsToggle}>
          <Text style={styles.rowLabel}>{t('settings.gpsTracking')}</Text>
          <View style={[styles.toggle, gps_enabled && styles.toggleOn]}>
            <Text style={[styles.toggleText, gps_enabled && styles.toggleTextOn]}>
              {gps_enabled ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        {gps_enabled && (
          <TouchableOpacity style={styles.row} onPress={handleBackgroundToggle}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('settings.backgroundTracking')}</Text>
              <Text style={styles.rowSubLabel}>{t('settings.backgroundTrackingDescription')}</Text>
            </View>
            <View style={[styles.toggle, background_tracking && styles.toggleOn]}>
              <Text style={[styles.toggleText, background_tracking && styles.toggleTextOn]}>
                {background_tracking ? t('common.on') : t('common.off')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionHeader}>{t('settings.defaults')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.defaultActivity')}</Text>
          <Text style={styles.rowValue}>{t(`activity.${default_activity_type}`)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
