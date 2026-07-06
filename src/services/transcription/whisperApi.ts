import RNFS from 'react-native-fs';
import {getApiKey} from './keychain';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
// ponytail: whisper-1 is cheapest and auto-detects language (Finnish/English).
// Swap to gpt-4o-mini-transcribe or a self-hosted endpoint here if needed.
const MODEL = 'whisper-1';

export type TranscriptionErrorKind =
  | 'no-key'
  | 'no-file'
  | 'auth'
  | 'rate'
  | 'network'
  | 'other';

export class TranscriptionError extends Error {
  kind: TranscriptionErrorKind;
  constructor(kind: TranscriptionErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'TranscriptionError';
  }
}

/** Multipart file part (name + mime) for the upload, from the path extension.
 *  Voice notes are .wav (Phase 2); legacy notes may be .m4a. */
export function filePartFor(path: string): {name: string; type: string} {
  if (/\.wav$/i.test(path)) { return {name: 'clip.wav', type: 'audio/wav'}; }
  return {name: 'clip.m4a', type: 'audio/m4a'};
}

/** Pure: HTTP status + parsed JSON → transcript text, or a typed throw.
 *  Extracted so it is unit-testable without a network. */
export function parseTranscriptionResponse(status: number, body: unknown): string {
  if (status === 200) {
    const text = (body as {text?: unknown} | null)?.text;
    if (typeof text === 'string') { return text.trim(); }
    throw new TranscriptionError('other', 'Malformed transcription response');
  }
  if (status === 401) { throw new TranscriptionError('auth', 'Invalid API key'); }
  if (status === 429) { throw new TranscriptionError('rate', 'Rate limit or quota exceeded'); }
  throw new TranscriptionError('other', `Transcription failed (HTTP ${status})`);
}

/** Upload the .m4a to OpenAI Whisper and return the transcript text. */
export async function transcribe(audioUri: string): Promise<string> {
  const key = await getApiKey();
  if (!key) { throw new TranscriptionError('no-key', 'No API key set'); }

  // Pre-flight: a missing file makes the multipart fetch fail instantly with a
  // "Network request failed" that would otherwise masquerade as a conn(network)
  // problem. Check first so the user gets an honest message.
  const fsPath = audioUri.replace('file://', '');
  if (!(await RNFS.exists(fsPath))) {
    throw new TranscriptionError('no-file', 'Recording file not found');
  }

  const uri = audioUri.startsWith('file://') ? audioUri : `file://${audioUri}`;
  const part = filePartFor(audioUri);
  const form = new FormData();
  // RN FormData accepts this {uri,name,type} shape for file parts.
  form.append('file', {uri, name: part.name, type: part.type} as unknown as Blob);
  form.append('model', MODEL);
  form.append('response_format', 'json');

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`},
      body: form,
    });
  } catch (e) {
    throw new TranscriptionError('network', String(e));
  }
  const json: unknown = await res.json().catch(() => ({}));
  return parseTranscriptionResponse(res.status, json);
}
