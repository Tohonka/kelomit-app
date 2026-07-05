import {
  parseTranscriptionResponse,
  TranscriptionError,
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
