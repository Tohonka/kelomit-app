/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { ensureDBReady } from './src/db/database';
import { handleNagEvent } from './src/services/nagService';
import { handleDeepLink } from './src/services/deepLinks';

// Nag notification actions (Done / Snooze) while the app is not in the
// foreground (headless JS, so open the DB first). A press navigates to the
// Nags tab: directly when the app is merely backgrounded, else stashed until
// the navigation container is ready.
notifee.onBackgroundEvent(async event => {
  await ensureDBReady();
  const pressed = await handleNagEvent(event);
  if (pressed) { handleDeepLink('kelomit://nags').catch(() => {}); }
});

AppRegistry.registerComponent(appName, () => App);
