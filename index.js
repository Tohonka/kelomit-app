/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { handleNotifeeEvent } from './src/services/notificationService';

// Handle day-end Yes/No actions when the app is backgrounded or killed.
notifee.onBackgroundEvent(async event => {
  await handleNotifeeEvent(event);
});

AppRegistry.registerComponent(appName, () => App);
