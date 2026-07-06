import {initWhisper} from 'whisper.rn';
import {MODEL_PATH, getModelState} from './modelManager';
import {TranscriptionError} from './whisperApi';

/** Transcribe a 16 kHz mono WAV entirely on-device. Loads the model, runs,
 *  then releases the context (frees ~140 MB). ponytail: cache the context if
 *  repeated transcribes feel slow. */
export async function transcribe(audioUri: string): Promise<string> {
  if ((await getModelState()) !== 'ready') {
    throw new TranscriptionError('model-missing', 'Whisper model not downloaded');
  }
  const filePath = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;
  let ctx: Awaited<ReturnType<typeof initWhisper>> | null = null;
  try {
    ctx = await initWhisper({filePath: MODEL_PATH});
    const {promise} = ctx.transcribe(filePath, {});
    const {result} = await promise;
    return (result ?? '').trim();
  } catch (e) {
    if (e instanceof TranscriptionError) { throw e; }
    throw new TranscriptionError('other', String(e));
  } finally {
    if (ctx) { await ctx.release().catch(() => {}); }
  }
}
