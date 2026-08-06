import {transcribe} from './transcription';
import {updateEntry, updateEntryMedia} from '../db/entries';
import {useEntryStore} from '../store/entryStore';
import type {EntryMedia} from '../types';

const MAX_TITLE = 50;
// Sentence-ending abbreviations ("Mr.", "Dr.", "e.g.") land well under this length;
// a genuine short sentence runs longer. Below it, the regex match is untrustworthy —
// fall through to the length-based cut instead of titling the note off "Mr.".
const MIN_SENTENCE_LEN = 15;

/** Opening words of a transcript as a note title: first sentence if it fits,
 *  else a word-boundary cut with an ellipsis. Null when there's nothing usable. */
export function titleFromTranscript(transcript: string): string | null {
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }
  const sentence = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length >= MIN_SENTENCE_LEN && sentence.length <= MAX_TITLE) {
    return sentence;
  }
  if (text.length <= MAX_TITLE) {
    return text;
  }
  const cut = text.slice(0, MAX_TITLE);
  const atWord = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${atWord.trimEnd()}…`;
}

/**
 * Widget voice flow, "auto-title" setting: transcribe the note's voice clip in
 * the background, store the transcript, and title an untitled note from the
 * spoken words. Every failure is silent — the note is already saved and manual
 * transcription stays available.
 */
export async function autoTitleVoiceNote(input: {
  entryId: number;
  dayId: number;
  media: EntryMedia[];
  userTitled: boolean;
}): Promise<void> {
  try {
    const clip = input.media.find(m => m.media_type === 'voice');
    if (!clip) {
      return;
    }
    const transcript = await transcribe(clip.file_path);
    await updateEntryMedia(clip.id, {transcript});
    if (!input.userTitled) {
      const title = titleFromTranscript(transcript);
      if (title) {
        await updateEntry(input.entryId, {title});
      }
    }
    await useEntryStore.getState().loadEntriesForDay(input.dayId);
  } catch {
    // Silent by design.
  }
}
