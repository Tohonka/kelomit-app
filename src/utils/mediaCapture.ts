import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {ensureCameraPermission} from '../services/permissionService';
import {makeMediaPath, ensureMediaDir} from './mediaUtils';
import type {MediaType} from '../types';

/** A freshly captured/picked media file, copied into app storage. */
export interface CapturedMedia {
  media_type: MediaType;
  file_path: string;
  thumbnail_path: string | null;
  duration_sec: number | null;
}

async function copyIntoAppStorage(sourceUri: string, kind: 'photo' | 'video', ext: string): Promise<string> {
  await ensureMediaDir();
  const dest = makeMediaPath(kind, ext);
  await RNFS.copyFile(sourceUri.replace('file://', ''), dest);
  return dest;
}

/** Capture a photo (camera or system gallery picker) → app-storage copy. */
export async function capturePhoto(fromGallery: boolean): Promise<CapturedMedia | null> {
  if (!fromGallery) {
    const ok = await ensureCameraPermission();
    if (!ok) { return null; }
  }
  // Gallery uses the system photo picker (no permission needed — Iter3 Phase 2).
  const result = fromGallery
    ? await launchImageLibrary({mediaType: 'photo', quality: 0.8})
    : await launchCamera({mediaType: 'photo', quality: 0.8, saveToPhotos: false});
  const uri = result.assets?.[0]?.uri;
  if (!uri) { return null; }
  const path = await copyIntoAppStorage(uri, 'photo', 'jpg');
  return {media_type: 'photo', file_path: path, thumbnail_path: path, duration_sec: null};
}

/** Capture a video (camera or system gallery picker) → app-storage copy. */
export async function captureVideo(fromGallery: boolean): Promise<CapturedMedia | null> {
  if (!fromGallery) {
    const ok = await ensureCameraPermission();
    if (!ok) { return null; }
  }
  const result = fromGallery
    ? await launchImageLibrary({mediaType: 'video'})
    : await launchCamera({mediaType: 'video', videoQuality: 'medium', durationLimit: 300});
  const asset = result.assets?.[0];
  if (!asset?.uri) { return null; }
  const path = await copyIntoAppStorage(asset.uri, 'video', 'mp4');
  return {
    media_type: 'video',
    file_path: path,
    thumbnail_path: null,
    duration_sec: asset.duration != null ? Math.round(asset.duration) : null,
  };
}
