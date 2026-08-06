const mockTranscribe = jest.fn();
const mockUpdateEntry = jest.fn();
const mockUpdateEntryMedia = jest.fn();
const mockLoadEntries = jest.fn();

jest.mock('../src/services/transcription', () => ({
  transcribe: (...a: unknown[]) => mockTranscribe(...a),
}));
jest.mock('../src/db/entries', () => ({
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
});

describe('autoTitleVoiceNote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribe.mockResolvedValue('Meeting with the roofers. Long talk.');
  });

  it('stores the transcript and titles an untitled note', async () => {
    await autoTitleVoiceNote({entryId: 9, dayId: 42, media: [voice()], userTitled: false});
    expect(mockTranscribe).toHaveBeenCalledWith('/m/a.wav');
    expect(mockUpdateEntryMedia).toHaveBeenCalledWith(7, {transcript: 'Meeting with the roofers. Long talk.'});
    expect(mockUpdateEntry).toHaveBeenCalledWith(9, {title: 'Meeting with the roofers.'});
    expect(mockLoadEntries).toHaveBeenCalledWith(42);
  });

  it('keeps a user-set title', async () => {
    await autoTitleVoiceNote({entryId: 9, dayId: 42, media: [voice()], userTitled: true});
    expect(mockUpdateEntryMedia).toHaveBeenCalled(); // transcript still stored
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('no-ops without a voice attachment', async () => {
    await autoTitleVoiceNote({
      entryId: 9, dayId: 42, userTitled: false,
      media: [voice({media_type: 'photo'})],
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('swallows transcription failure', async () => {
    mockTranscribe.mockRejectedValue(new Error('offline'));
    await expect(
      autoTitleVoiceNote({entryId: 9, dayId: 42, media: [voice()], userTitled: false}),
    ).resolves.toBeUndefined();
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });
});
