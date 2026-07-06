import RNFS from 'react-native-fs';

// ponytail: HF public ggml base model. Swap to a self-hosted (Hetzner) URL here.
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/kelomit/models`;
export const MODEL_PATH = `${MODEL_DIR}/ggml-base.bin`;

/** Pure: download progress as a 0–100 integer. */
export function progressPct(bytesWritten: number, contentLength: number): number {
  if (contentLength <= 0) { return 0; }
  return Math.min(100, Math.round((bytesWritten / contentLength) * 100));
}

export async function getModelState(): Promise<'missing' | 'ready'> {
  return (await RNFS.exists(MODEL_PATH)) ? 'ready' : 'missing';
}

/** Download to a temp file, move into place on success (never a half file). */
export async function downloadModel(onProgress: (pct: number) => void): Promise<void> {
  if (!(await RNFS.exists(MODEL_DIR))) { await RNFS.mkdir(MODEL_DIR); }
  const tmp = `${MODEL_PATH}.download`;
  if (await RNFS.exists(tmp)) { await RNFS.unlink(tmp); }
  const {promise} = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: tmp,
    progressInterval: 500,
    progress: r => onProgress(progressPct(r.bytesWritten, r.contentLength)),
  });
  const res = await promise;
  if (res.statusCode !== 200) {
    await RNFS.unlink(tmp).catch(() => {});
    throw new Error(`Model download failed (HTTP ${res.statusCode})`);
  }
  await RNFS.moveFile(tmp, MODEL_PATH);
}

export async function deleteModel(): Promise<void> {
  if (await RNFS.exists(MODEL_PATH)) { await RNFS.unlink(MODEL_PATH); }
}
