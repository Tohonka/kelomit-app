import RNFS from 'react-native-fs';
import {runSyncTo} from '../syncService';
import type {SyncResult} from '../syncService';
import {
  getCompanionConfig,
  recordCompanionError,
  recordCompanionSuccess,
} from './settings';

const SNAPSHOT_PATH = `${RNFS.CachesDirectoryPath}/kelomit-companion.db`;

/** Push the whole database (+ all media, video included — it's the LAN) to
 *  the paired desktop. Never throws. */
export async function pushToCompanion(): Promise<SyncResult> {
  const config = await getCompanionConfig();
  if (!config) {
    return 'not_configured';
  }
  return runSyncTo({
    url: config.url,
    token: config.token,
    includeVideo: true,
    snapshotPath: SNAPSHOT_PATH,
    onSuccess: recordCompanionSuccess,
    onError: recordCompanionError,
  });
}
