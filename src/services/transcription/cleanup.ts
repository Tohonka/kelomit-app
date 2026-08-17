// Optional LLM pass over a finished transcript: fix the silly words speech-to-
// text invents, and derive a short headline. Off by default; needs the same
// OpenAI key as the API transcription engine.
//
// Rewriting is only safe because nothing is lost: the .wav and the raw
// transcript on the media row both survive untouched, so every rewrite stays
// checkable against what was actually said.
import {getSetting} from '../../db/settings';
import {getApiKey} from './keychain';
import {TranscriptionError} from './whisperApi';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// ponytail: gpt-4o-mini — this is proofreading, not reasoning. Bump the model
// if it starts mangling puhekieli or inventing content.
const MODEL = 'gpt-4o-mini';
const MAX_TITLE = 50;

const SYSTEM_PROMPT = [
  'You clean up speech-to-text transcripts of a person’s spoken work notes.',
  'Return JSON: {"text": string, "title": string}.',
  '"text": the transcript rewritten as what the speaker most likely actually said.',
  'Fix mis-heard words, garbled names and obvious nonsense. Fix punctuation and casing.',
  'Keep the original language (Finnish stays Finnish, including spoken/colloquial style).',
  'Do NOT summarise, shorten, translate, or add anything that was not said.',
  `"title": a short headline for the note, at most ${MAX_TITLE} characters, in the same language.`,
].join(' ');

export interface Cleanup {
  text: string;
  title: string | null;
}

/** Pure: HTTP status + parsed JSON → cleaned text and title, or a typed throw.
 *  Extracted so it is unit-testable without a network. */
export function parseCleanupResponse(status: number, body: unknown): Cleanup {
  if (status === 401) { throw new TranscriptionError('auth', 'Invalid API key'); }
  if (status === 429) { throw new TranscriptionError('rate', 'Rate limit or quota exceeded'); }
  if (status !== 200) { throw new TranscriptionError('other', `Cleanup failed (HTTP ${status})`); }

  const content = (body as {choices?: {message?: {content?: unknown}}[]} | null)
    ?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new TranscriptionError('other', 'Malformed cleanup response');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TranscriptionError('other', 'Cleanup response was not JSON');
  }
  const {text, title} = (parsed ?? {}) as {text?: unknown; title?: unknown};
  // An empty rewrite means the model dropped the note — refuse it rather than
  // blanking the user's words.
  if (typeof text !== 'string' || !text.trim()) {
    throw new TranscriptionError('other', 'Cleanup returned no text');
  }
  const headline = typeof title === 'string' ? title.trim() : '';
  return {
    text: text.trim(),
    title: headline ? headline.slice(0, MAX_TITLE) : null,
  };
}

/** Send one transcript through the model. Throws TranscriptionError. */
export async function cleanUpTranscript(transcript: string): Promise<Cleanup> {
  const key = await getApiKey();
  if (!key) { throw new TranscriptionError('no-key', 'No API key set'); }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: {type: 'json_object'},
        messages: [
          {role: 'system', content: SYSTEM_PROMPT},
          {role: 'user', content: transcript},
        ],
      }),
    });
  } catch (e) {
    throw new TranscriptionError('network', String(e));
  }
  const json: unknown = await res.json().catch(() => ({}));
  return parseCleanupResponse(res.status, json);
}

/** Gate + swallow: the cleanup setting is off, or there's no key, or the call
 *  failed → null, and the caller keeps the raw transcript. Never throws. */
export async function cleanUpIfEnabled(transcript: string): Promise<Cleanup | null> {
  try {
    if ((await getSetting('transcription_cleanup')) !== 'true') { return null; }
    return await cleanUpTranscript(transcript);
  } catch {
    return null;
  }
}
