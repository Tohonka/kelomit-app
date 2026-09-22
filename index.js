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

// Nag notification actions (Done / Snooze) while the app is not running:
// headless JS, so open the DB first. A press just launches the app.
notifee.onBackgroundEvent(async event => {
  await ensureDBReady();
  await handleNagEvent(event);
});

AppRegistry.registerComponent(appName, () => App);
