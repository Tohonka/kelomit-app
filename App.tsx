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
import {pruneActivityEventsOlderThan} from './src/db/activityEvents';
import {pruneDiagLog, diag} from './src/services/diag';
import {getAllSettings} from './src/db/settings';
import {getLocations} from './src/db/locations';
import {stopTracking} from './src/services/gpsService';
import {ensureNotificationChannel, requestNotificationPermission} from './src/services/notificationService';
import {maybeAutoSync} from './src/services/syncService';
import {
  reconcileRouteHistory,
  reconcileTrackingJournal,
  subscribeTrackingJournal,
  syncTrackingState,
} from './src/services/trackingOrchestrator';
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
      .then(async () => {
        await reconcileTrackingJournal().catch(reconcileError => {
          diag('journal.launch.fail', String(reconcileError));
        });
        reconcileRouteHistory().catch(reconcileError => {
          diag('route.launch.fail', String(reconcileError));
        });
        await load();
        setDbReady(true);
        ensureNotificationChannel().catch(() => {});
        // Log any sessions a home-screen widget finished while we were closed.
        useSessionStore.getState().reconcile().catch(() => {});
        // Drop raw trail points past the retention window (best-effort).
        pruneGpsTracksOlderThan().catch(() => {});
        pruneActivityEventsOlderThan().catch(() => {});
        // Prune old diagnostic-log rows (the flat file self-trims).
        pruneDiagLog().catch(() => {});
        diag('app.launch', '');
      })
      .catch(e => setError(String(e)));
  }, [load]);

  useEffect(() => {
    if (!dbReady || !loaded) {
      return;
    }

    const syncGps = async () => {
      const settings = await getAllSettings().catch(() => null);
      if (!settings) return;
      const backgroundTracking = useSettingsStore.getState().background_tracking;
      if (settings.gps_enabled) {
        // The background foreground service posts an ongoing notification; on
        // Android 13+ it stays hidden without POST_NOTIFICATIONS, so request it
        // when background tracking is on. Idempotent — no repeat dialogs.
        if (backgroundTracking) {
          requestNotificationPermission().catch(() => {});
        }
      }
      const locations = await getLocations();
      await syncTrackingState({
        gps_enabled: settings.gps_enabled,
        gps_interval_ms: settings.gps_interval_ms,
        background_tracking: backgroundTracking,
      }, locations);
    };

    // Initial start is delayed; resume-from-background (below) starts immediately.
    const startTimer = setTimeout(() => {
      syncGps().catch(syncError => diag('track.sync.fail', String(syncError)));
    }, GPS_START_DELAY_MS);
    const journalSub = subscribeTrackingJournal();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        reconcileTrackingJournal()
          .catch(reconcileError => diag('journal.resume.fail', String(reconcileError)))
          .then(() => syncGps())
          .catch(resumeError => diag('track.resume.fail', String(resumeError)));
        // A widget may have started/stopped a session while we were backgrounded.
        useSessionStore.getState().reconcile().catch(() => {});
        // Fire and forget — sync failures never surface here.
        maybeAutoSync().catch(() => {});
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
      journalSub.remove();
      if (!useSettingsStore.getState().background_tracking) {
        stopTracking();
      }
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
