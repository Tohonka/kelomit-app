import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {startTracking, stopTracking} from '../../services/gpsService';
import {useTheme} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';
import TimePicker from '../../components/ui/TimePicker';
import {hhmmToIsoOn, formatTime, todayDate} from '../../utils/dateUtils';

export default function TrackingSettings() {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const {
    gps_enabled, setGpsEnabled, gps_interval_ms, default_activity_type,
    usual_start, setUsualStart, usual_end, setUsualEnd,
    prefill_from_usual, setPrefillFromUsual,
  } = useSettingsStore();

  const handleGpsToggle = async () => {
    const next = !gps_enabled;
    await setGpsEnabled(next);
    if (next) { startTracking(gps_interval_ms); } else { stopTracking(); }
  };

  // TimePicker speaks ISO instants; usual hours are stored as wall-clock
  // "HH:mm". Anchor to today purely so the picker opens at the right time.
  const today = todayDate();
  const usualStartIso = usual_start ? hhmmToIsoOn(today, usual_start) : null;
  const usualEndIso = usual_end ? hhmmToIsoOn(today, usual_end) : null;

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

        <Text style={styles.sectionHeader}>{t('settings.workingHours')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.usualStart')}</Text>
          <TimePicker
            value={usualStartIso}
            placeholder={t('settings.timeNotSet')}
            onChange={iso => setUsualStart(formatTime(iso))}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.usualEnd')}</Text>
          <TimePicker
            value={usualEndIso}
            placeholder={t('settings.timeNotSet')}
            onChange={iso => setUsualEnd(formatTime(iso))}
          />
        </View>

        <TouchableOpacity style={styles.row} onPress={() => setPrefillFromUsual(!prefill_from_usual)}>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>{t('settings.prefillNewDays')}</Text>
            <Text style={styles.rowSubLabel}>{t('settings.prefillNewDaysDescription')}</Text>
          </View>
          <View style={[styles.toggle, prefill_from_usual && styles.toggleOn]}>
            <Text style={[styles.toggleText, prefill_from_usual && styles.toggleTextOn]}>
              {prefill_from_usual ? t('common.on') : t('common.off')}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>{t('settings.defaults')}</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.defaultActivity')}</Text>
          <Text style={styles.rowValue}>{t(`activity.${default_activity_type}`)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
