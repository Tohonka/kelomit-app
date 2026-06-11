import {Platform} from 'react-native';
import RNFS from 'react-native-fs';

const MEDIA_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/media`;

export async function ensureMediaDir(): Promise<void> {
  const exists = await RNFS.exists(MEDIA_DIR);
  if (!exists) {
    await RNFS.mkdir(MEDIA_DIR);
  }
}

export function makeMediaPath(
  type: 'photo' | 'video' | 'voice',
  ext: string,
): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${MEDIA_DIR}/${type}_${ts}_${rand}.${ext}`;
}

export function makeThumbnailPath(originalPath: string): string {
  const base = originalPath.replace(/\.[^.]+$/, '');
  return `${base}_thumb.jpg`;
}

/** Prefix file:// for RN Image/Video sources on Android */
export function fileUri(path: string): string {
  if (Platform.OS === 'android' && !path.startsWith('file://')) {
    return `file://${path}`;
  }
  return path;
}
