import {
  parseTranscriptionResponse,
  TranscriptionError,
  filePartFor,
} from '../src/services/transcription/whisperApi';

// Returns the thrown error's kind, or 'no-throw' if it didn't throw — so a
// missing throw fails the assertion instead of passing vacuously.
function kindOf(fn: () => unknown): string {
  try { fn(); return 'no-throw'; } catch (e) {
    return e instanceof TranscriptionError ? e.kind : 'not-a-TranscriptionError';
  }
}

describe('parseTranscriptionResponse', () => {
  it('returns trimmed text on 200', () => {
    expect(parseTranscriptionResponse(200, {text: '  hi there  '})).toBe('hi there');
  });

  it('throws "other" on a 200 with no text field', () => {
    expect(kindOf(() => parseTranscriptionResponse(200, {}))).toBe('other');
  });

  it('maps 401 → auth', () => {
    expect(kindOf(() => parseTranscriptionResponse(401, {}))).toBe('auth');
  });

  it('maps 429 → rate', () => {
    expect(kindOf(() => parseTranscriptionResponse(429, {}))).toBe('rate');
  });

  it('maps other statuses → other', () => {
    expect(kindOf(() => parseTranscriptionResponse(500, {}))).toBe('other');
  });
});

describe('filePartFor', () => {
  it('maps .wav → audio/wav', () => {
    expect(filePartFor('/x/voice_1.wav')).toEqual({name: 'clip.wav', type: 'audio/wav'});
  });
  it('maps .m4a → audio/m4a', () => {
    expect(filePartFor('/x/voice_1.m4a')).toEqual({name: 'clip.m4a', type: 'audio/m4a'});
  });
  it('falls back to m4a for unknown/extensionless', () => {
    expect(filePartFor('/x/voice_1')).toEqual({name: 'clip.m4a', type: 'audio/m4a'});
  });
  it('is case-insensitive', () => {
    expect(filePartFor('/x/V.WAV')).toEqual({name: 'clip.wav', type: 'audio/wav'});
  });
});
