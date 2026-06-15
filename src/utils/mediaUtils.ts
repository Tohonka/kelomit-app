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

export async function deleteMediaFile(path: string | null | undefined): Promise<void> {
  if (!path) {
    return;
  }
  const fsPath = path.replace('file://', '');
  try {
    if (await RNFS.exists(fsPath)) {
      await RNFS.unlink(fsPath);
    }
  } catch {
    // Media cleanup should not block saving/deleting the journal entry.
  }
}

/** Prefix file:// for RN Image/Video sources on Android */
export function fileUri(path: string): string {
  if (Platform.OS === 'android' && !path.startsWith('file://')) {
    return `file://${path}`;
  }
  return path;
}
