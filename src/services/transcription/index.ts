// Transcription seam. Dispatches to the on-device (whisper.rn) or OpenAI-API
// provider based on the `transcription_provider` setting (default on-device).
import {getSetting} from '../../db/settings';
import {transcribe as apiTranscribe} from './whisperApi';
import {transcribe as onDeviceTranscribe} from './onDevice';
import {selectProvider} from './selectProvider';

export {TranscriptionError} from './whisperApi';
export type {TranscriptionErrorKind} from './whisperApi';
export {selectProvider} from './selectProvider';

export async function transcribe(audioUri: string): Promise<string> {
  const provider = selectProvider(await getSetting('transcription_provider'));
  return provider === 'api' ? apiTranscribe(audioUri) : onDeviceTranscribe(audioUri);
}
