import React, {useEffect, useState, useRef} from 'react';
import {View, Text, StyleSheet, ActivityIndicator, AppState, StatusBar} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {initDB} from './src/db/database';
import {getAllSettings} from './src/db/settings';
import {startTracking, stopTracking} from './src/services/gpsService';
import {useSettingsStore} from './src/store/settingsStore';
import {useTheme, lightColors, typography} from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';

function AppContent() {
  const {colors, isDark} = useTheme();
  const {loaded, load} = useSettingsStore();
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initDB()
      .then(() => {
        setDbReady(true);
        load();
      })
      .catch(e => setError(String(e)));
  }, [load]);

  useEffect(() => {
    if (!dbReady || !loaded) {
      return;
    }

    const startGpsIfEnabled = async () => {
      const settings = await getAllSettings().catch(() => null);
      if (settings?.gps_enabled) {
        startTracking(settings.gps_interval_ms);
      }
    };

    startGpsIfEnabled();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        startGpsIfEnabled();
      } else if (
        appState.current === 'active' &&
        nextState.match(/inactive|background/)
      ) {
        stopTracking();
      }
      appState.current = nextState;
    });

    return () => {
      sub.remove();
      stopTracking();
    };
  }, [dbReady, loaded]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, {color: colors.error}]}>
          Failed to open database:{'\n'}
          {error}
        </Text>
      </View>
    );
  }

  if (!dbReady) {
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
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
