const mockTranscribe = jest.fn();
const mockUpdateEntry = jest.fn();
const mockUpdateEntryMedia = jest.fn();
const mockGetEntry = jest.fn();
const mockLoadEntries = jest.fn();
const mockCleanUp = jest.fn();

jest.mock('../src/services/transcription', () => ({
  transcribe: (...a: unknown[]) => mockTranscribe(...a),
}));
jest.mock('../src/services/transcription/cleanup', () => ({
  cleanUpIfEnabled: (...a: unknown[]) => mockCleanUp(...a),
}));
jest.mock('../src/db/entries', () => ({
  getEntry: (...a: unknown[]) => mockGetEntry(...a),
  updateEntry: (...a: unknown[]) => mockUpdateEntry(...a),
  updateEntryMedia: (...a: unknown[]) => mockUpdateEntryMedia(...a),
}));
jest.mock('../src/store/entryStore', () => ({
  useEntryStore: {getState: () => ({loadEntriesForDay: mockLoadEntries})},
}));

import {titleFromTranscript, autoTitleVoiceNote} from '../src/services/autoTitle';
import type {EntryMedia} from '../src/types';

const voice = (over: Partial<EntryMedia> = {}): EntryMedia => ({
  id: 7, entry_id: 9, media_type: 'voice', file_path: '/m/a.wav',
  thumbnail_path: null, duration_sec: 5, position: 0, transcript: null,
  created_at: '', updated_at: '', ...over,
});

describe('titleFromTranscript', () => {
  it('takes the first sentence when short', () => {
    expect(titleFromTranscript('Bought the flanges. Then lunch.')).toBe('Bought the flanges.');
  });
  it('cuts long text at a word boundary with ellipsis', () => {
    const t = titleFromTranscript(
      'this is a very long rambling opening that just keeps going without any sentence break at all',
    );
    expect(t!.length).toBeLessThanOrEqual(51);
    expect(t!.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/\s…$/);
  });
  it('collapses whitespace', () => {
    expect(titleFromTranscript('  hello   world  ')).toBe('hello world');
  });
  it('null for empty/blank', () => {
    expect(titleFromTranscript('')).toBeNull();
    expect(titleFromTranscript('   ')).toBeNull();
  });
  it('does not title off an abbreviation like "Mr."', () => {
    const t = titleFromTranscript('Mr. Smith called about scheduling the roof inspection');
    expect(t).not.toBe('Mr.');
    expect(t).toBe('Mr. Smith called about scheduling the roof…');
  });
  it('does not title off an abbreviation like "e.g."', () => {
    const t = titleFromTranscript('e.g. the thing broke down');
    expect(t).not.toBe('e.g.');
    expect(t).toBe('e.g. the thing broke down');
  });
  it('does not title off a Finnish abbreviation like "Dr."', () => {
    const t = titleFromTranscript('Dr. Virtanen soitti tapaamisesta ensi viikolla');
    expect(t).not.toBe('Dr.');
    expect(t).toBe('Dr. Virtanen soitti tapaamisesta ensi viikolla');
  });
  it('does not title off an abbreviation preceded by filler words', () => {
    const t = titleFromTranscript('Yeah so like, Corp. tax due soon');
    expect(t).not.toBe('Yeah so like, Corp.');
    expect(t).toBe('Yeah so like, Corp. tax due soon');
  });
  it('does not title off an abbreviation preceded by more filler words', () => {
    const t = titleFromTranscript('So basically Dr. Smith called about the roof');
    expect(t).not.toBe('So basically Dr.');
    expect(t).toBe('So basically Dr. Smith called about the roof');
  });
  it('does not title off the Finnish abbreviation "esim."', () => {
    const t = titleFromTranscript('No esim. katto pitää korjata ensi viikolla');
    expect(t).not.toBe('No esim.');
    expect(t).toBe('No esim. katto pitää korjata ensi viikolla');
  });
});

describe('autoTitleVoiceNote', () => {
  const TRANSCRIPT = 'Meeting with the roofers. Long talk.';
  const run = () => autoTitleVoiceNote({entryId: 9, dayId: 42, media: [voice()]});

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribe.mockResolvedValue(TRANSCRIPT);
    mockGetEntry.mockResolvedValue({id: 9, title: null, body: null});
    mockCleanUp.mockResolvedValue(null); // cleanup off by default
  });

  it('puts the transcript in the note body and a headline in the title', async () => {
    await run();
    expect(mockTranscribe).toHaveBeenCalledWith('/m/a.wav');
    expect(mockUpdateEntryMedia).toHaveBeenCalledWith(7, {transcript: TRANSCRIPT});
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {
      body: TRANSCRIPT,
      title: 'Meeting with the roofers.',
    });
    expect(mockLoadEntries).toHaveBeenCalledWith(42);
  });

  it('keeps a user-set title but still fills the body', async () => {
    mockGetEntry.mockResolvedValue({id: 9, title: 'Roof job', body: null});
    await run();
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {body: TRANSCRIPT});
  });

  it('never overwrites a body the user already wrote', async () => {
    mockGetEntry.mockResolvedValue({id: 9, title: null, body: 'typed while it transcribed'});
    await run();
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {title: 'Meeting with the roofers.'});
  });

  it('writes nothing when the note is already titled and filled', async () => {
    mockGetEntry.mockResolvedValue({id: 9, title: 'Roof job', body: 'notes'});
    await run();
    expect(mockUpdateEntryMedia).toHaveBeenCalled(); // transcript still stored
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('no-ops without a voice attachment', async () => {
    await autoTitleVoiceNote({
      entryId: 9, dayId: 42,
      media: [voice({media_type: 'photo'})],
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('swallows transcription failure', async () => {
    mockTranscribe.mockRejectedValue(new Error('offline'));
    await expect(run()).resolves.toBeUndefined();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('uses the cleaned text and LLM headline when cleanup is on', async () => {
    mockCleanUp.mockResolvedValue({text: 'Meeting with the roofers.', title: 'Roofers'});
    await run();
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {
      body: 'Meeting with the roofers.',
      title: 'Roofers',
    });
    // The raw transcript still goes to the media row, cleaned or not.
    expect(mockUpdateEntryMedia).toHaveBeenCalledWith(7, {transcript: TRANSCRIPT});
  });

  it('falls back to the plain headline when cleanup returns no title', async () => {
    mockCleanUp.mockResolvedValue({text: 'Cleaned it up nicely. Second bit.', title: null});
    await run();
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {
      body: 'Cleaned it up nicely. Second bit.',
      title: 'Cleaned it up nicely.',
    });
  });
});
