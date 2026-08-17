import {transcribe} from './transcription';
import {cleanUpIfEnabled} from './transcription/cleanup';
import {getEntry, updateEntry, updateEntryMedia} from '../db/entries';
import {useEntryStore} from '../store/entryStore';
import type {EntryMedia} from '../types';

const MAX_TITLE = 50;
// A "." sentence-end is only trustworthy if the word right before it isn't an
// abbreviation. Abbreviations are short tokens ending in that period — "Mr.",
// "Dr.", "St.", "vs.", "etc.", "e.g." — and filler dictated before them ("So
// basically Dr.") doesn't change that. The longest real cases are "Corp." and
// Finnish "esim.", both 5 chars including the period, so that's the cutoff.
// "!" and "?" can't end an abbreviation, so they skip the check entirely.
const ABBREV_TOKEN_MAX = 5;

/** Opening words of a transcript as a note title: first sentence if it fits,
 *  else a word-boundary cut with an ellipsis. Null when there's nothing usable. */
export function titleFromTranscript(transcript: string): string | null {
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }
  const match = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim();
  const endsOnAbbreviation =
    match?.endsWith('.') && (match.split(' ').pop() ?? '').length <= ABBREV_TOKEN_MAX;
  const sentence = match && !endsOnAbbreviation && match.length <= MAX_TITLE ? match : null;
  if (sentence) {
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
 * the background, then fill the note from the spoken words — transcript as the
 * note body, a short headline derived from it as the title. Two steps, because
 * the transcript IS the note; the title is only a label for it.
 *
 * The raw transcript also stays on the media row next to the .wav, so the
 * original is always verifiable no matter what ends up in the body.
 *
 * Every failure is silent — the note is already saved and manual transcription
 * stays available.
 */
export async function autoTitleVoiceNote(input: {
  entryId: number;
  dayId: number;
  media: EntryMedia[];
}): Promise<void> {
  try {
    const clip = input.media.find(m => m.media_type === 'voice');
    if (!clip) {
      return;
    }
    const transcript = await transcribe(clip.file_path);
    await updateEntryMedia(clip.id, {transcript});

    // Optional second pass: an LLM rewrite of the mis-heard words, plus a real
    // headline. Null whenever it's off, unavailable or failed — the raw
    // transcript is always a working fallback.
    const cleaned = await cleanUpIfEnabled(transcript);
    const noteText = cleaned?.text ?? transcript;

    // Re-read rather than trusting what the note looked like at save time:
    // transcription takes seconds, and the user can open the note and start
    // typing while it runs. Whatever they wrote wins.
    const current = await getEntry(input.entryId);
    const patch: {title?: string; body?: string} = {};
    if (!current?.body?.trim()) {
      patch.body = noteText;
    }
    if (!current?.title?.trim()) {
      const title = cleaned?.title ?? titleFromTranscript(noteText);
      if (title) {
        patch.title = title;
      }
    }
    if (Object.keys(patch).length > 0) {
      await updateEntry(input.entryId, patch);
    }
    await useEntryStore.getState().loadEntriesForDay(input.dayId);
  } catch {
    // Silent by design.
  }
}
