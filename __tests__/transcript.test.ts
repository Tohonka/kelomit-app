import {mergeTranscriptIntoBody} from '../src/utils/transcript';

describe('mergeTranscriptIntoBody', () => {
  it('fills an empty body with the transcript', () => {
    expect(mergeTranscriptIntoBody(null, 'hello')).toBe('hello');
    expect(mergeTranscriptIntoBody('', 'hello')).toBe('hello');
    expect(mergeTranscriptIntoBody('   ', 'hello')).toBe('hello');
  });

  it('appends on a new line when body has text', () => {
    expect(mergeTranscriptIntoBody('note', 'hello')).toBe('note\nhello');
  });

  it('trims surrounding whitespace on both sides', () => {
    expect(mergeTranscriptIntoBody('  note  ', '  hello  ')).toBe('note\nhello');
  });

  it('leaves body unchanged when transcript is blank', () => {
    expect(mergeTranscriptIntoBody('note', '   ')).toBe('note');
  });
});
