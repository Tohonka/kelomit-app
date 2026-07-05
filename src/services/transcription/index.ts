// Transcription seam. Phase 1: one provider (Whisper API). Later phases
// (on-device whisper.rn, custom endpoint) switch here behind this signature.
import {transcribe as whisperApiTranscribe} from './whisperApi';

export {TranscriptionError} from './whisperApi';
export type {TranscriptionErrorKind} from './whisperApi';

export function transcribe(audioUri: string): Promise<string> {
  return whisperApiTranscribe(audioUri);
}
