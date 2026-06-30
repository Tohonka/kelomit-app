import React, {useEffect, useState, useRef} from 'react';
import {View, Text, StyleSheet, ActivityIndicator, AppState, StatusBar} from 'react-native';
import './src/i18n';
import {useTranslation} from 'react-i18next';
import type {AppStateStatus} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {initDB} from './src/db/database';
import {pruneGpsTracksOlderThan} from './src/db/gps';
import {getAllSettings} from './src/db/settings';
import {startTracking, stopTracking} from './src/services/gpsService';
import {ensureNotificationChannel, registerForegroundNotifeeHandler} from './src/services/notificationService';
import {useSettingsStore} from './src/store/settingsStore';
import {useSessionStore} from './src/store/sessionStore';
import {useTheme, lightColors, typography} from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';

// Defer GPS startup off the critical launch path so location init doesn't
// compete with the first render / DB warm-up. Foreground-resume start stays
// immediate (the app is already warm by then).
const GPS_START_DELAY_MS = 3000;

function AppContent() {
  const {colors, isDark} = useTheme();
  const {t} = useTranslation();
  const {loaded, load} = useSettingsStore();
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initDB()
      .then(() => {
        setDbReady(true);
        load();
        ensureNotificationChannel().catch(() => {});
        // Log any sessions a home-screen widget finished while we were closed.
        useSessionStore.getState().reconcile().catch(() => {});
        // Drop raw trail points past the retention window (best-effort).
        pruneGpsTracksOlderThan().catch(() => {});
      })
      .catch(e => setError(String(e)));
  }, [load]);

  // Handle day-end Yes/No notification actions while the app is in the foreground.
  useEffect(() => registerForegroundNotifeeHandler(), []);

  useEffect(() => {
    if (!dbReady || !loaded) {
      return;
    }

    const startGpsIfEnabled = async () => {
      const settings = await getAllSettings().catch(() => null);
      if (settings?.gps_enabled) {
        // startTracking starts the native foreground service itself when
        // background tracking is on (and must run while foreground — Android 12+
        // forbids starting an FGS from the background). Called on launch + resume.
        startTracking(settings.gps_interval_ms);
      }
    };

    // Initial start is delayed; resume-from-background (below) starts immediately.
    const startTimer = setTimeout(startGpsIfEnabled, GPS_START_DELAY_MS);

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        startGpsIfEnabled();
        // A widget may have started/stopped a session while we were backgrounded.
        useSessionStore.getState().reconcile().catch(() => {});
      } else if (
        appState.current === 'active' &&
        nextState.match(/inactive|background/)
      ) {
        const {gps_enabled, background_tracking} = useSettingsStore.getState();
        // With background tracking on, keep the watch alive (the foreground
        // service is already running). Otherwise stop tracking as before.
        if (!(gps_enabled && background_tracking)) {
          stopTracking();
        }
      }
      appState.current = nextState;
    });

    return () => {
      clearTimeout(startTimer);
      sub.remove();
      stopTracking();
    };
  }, [dbReady, loaded]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, {color: colors.error}]}>
          {t('app.dbErrorTitle')}{'\n'}
          {error}
        </Text>
      </View>
    );
  }

  if (!dbReady || !loaded) {
    return (
      <View style={[styles.center, {backgroundColor: colors.bg}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.bg,
  },
  errorText: {
    fontSize: typography.sizes.base,
    textAlign: 'center',
    margin: 24,
  },
});
