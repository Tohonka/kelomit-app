import React, {useEffect, useState, useRef} from 'react';
import {View, Text, StyleSheet, ActivityIndicator, AppState, StatusBar} from 'react-native';
import './src/i18n';
import {useTranslation} from 'react-i18next';
import type {AppStateStatus} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {initDB} from './src/db/database';
import {getAllSettings} from './src/db/settings';
import {startTracking, stopTracking} from './src/services/gpsService';
import {useSettingsStore} from './src/store/settingsStore';
import {useTheme, lightColors, typography} from './src/theme';
import RootNavigator from './src/navigation/RootNavigator';

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
