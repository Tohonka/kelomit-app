import {Platform, Alert} from 'react-native';
import i18n from '../i18n';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  type Permission,
} from 'react-native-permissions';

async function ensurePermission(permission: Permission): Promise<boolean> {
  const status = await check(permission);
  if (status === RESULTS.GRANTED) {
    return true;
  }
  if (status === RESULTS.DENIED) {
    const result = await request(permission);
    return result === RESULTS.GRANTED;
  }
  // BLOCKED or UNAVAILABLE
  Alert.alert(
    i18n.t('permissions.requiredTitle'),
    i18n.t('permissions.requiredMessage'),
  );
  return false;
}

export async function ensureCameraPermission(): Promise<boolean> {
  return ensurePermission(
    Platform.OS === 'android'
      ? PERMISSIONS.ANDROID.CAMERA
      : PERMISSIONS.IOS.CAMERA,
  );
}

export async function ensureMicrophonePermission(): Promise<boolean> {
  return ensurePermission(
    Platform.OS === 'android'
      ? PERMISSIONS.ANDROID.RECORD_AUDIO
      : PERMISSIONS.IOS.MICROPHONE,
  );
}

/**
 * Request "Allow all the time" location, needed for background GPS. On Android
 * 10+ foreground (fine) location must be granted first, and the background grant
 * is made from system Settings — so a DENIED/BLOCKED result here means the user
 * should flip it to "Allow all the time" themselves. iOS is handled by the
 * always-permission flow elsewhere; this is Android-only.
 */
export async function ensureBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const fine = await ensurePermission(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
  if (!fine) {
    return false;
  }
  const status = await check(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION);
  if (status === RESULTS.GRANTED) {
    return true;
  }
  if (status === RESULTS.DENIED) {
    const result = await request(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION);
    if (result === RESULTS.GRANTED) {
      return true;
    }
  }
  Alert.alert(
    i18n.t('permissions.backgroundLocationTitle'),
    i18n.t('permissions.backgroundLocationMessage'),
  );
  return false;
}

// Gallery imports go through the Android system photo picker
// (react-native-image-picker `launchImageLibrary`), which grants per-item
// access and needs no READ_MEDIA_* / storage permission. Audio is only ever
// recorded, never picked. So no media-library permission helper is required.
// See Iteration 3 Phase 2.
