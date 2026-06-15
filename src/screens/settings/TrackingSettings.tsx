import React, {useMemo} from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSettingsStore} from '../../store/settingsStore';
import {startTracking, stopTracking} from '../../services/gpsService';
import {useTheme} from '../../theme';
import {makeSettingsStyles} from './settingsStyles';

export default function TrackingSettings() {
  const {colors} = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);
  const {
    gps_enabled, setGpsEnabled, gps_interval_ms, default_activity_type,
  } = useSettingsStore();

  const handleGpsToggle = async () => {
    const next = !gps_enabled;
    await setGpsEnabled(next);
    if (next) { startTracking(gps_interval_ms); } else { stopTracking(); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Location</Text>

        <TouchableOpacity style={styles.row} onPress={handleGpsToggle}>
          <Text style={styles.rowLabel}>GPS tracking</Text>
          <View style={[styles.toggle, gps_enabled && styles.toggleOn]}>
            <Text style={[styles.toggleText, gps_enabled && styles.toggleTextOn]}>
              {gps_enabled ? 'On' : 'Off'}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Defaults</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Default activity</Text>
          <Text style={styles.rowValue}>{default_activity_type}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
