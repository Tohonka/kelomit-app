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

export async function ensureMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      // Android 13+: separate READ_MEDIA_* permissions
      const imgOk = await ensurePermission(
        PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
      );
      const vidOk = await ensurePermission(
        PERMISSIONS.ANDROID.READ_MEDIA_VIDEO,
      );
      return imgOk && vidOk;
    }
    return ensurePermission(PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE);
  }
  return ensurePermission(PERMISSIONS.IOS.PHOTO_LIBRARY);
}

export async function ensureAudioLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    return ensurePermission(PERMISSIONS.ANDROID.READ_MEDIA_AUDIO);
  }
  return true; // older Android or iOS handles this differently
}
