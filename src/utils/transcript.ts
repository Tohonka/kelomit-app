/** Merge a transcript into an existing note body: fill if the body is empty,
 *  otherwise append on a new line. Both sides trimmed. */
export function mergeTranscriptIntoBody(
  body: string | null,
  transcript: string,
): string {
  const existing = (body ?? '').trim();
  const add = transcript.trim();
  if (!existing) { return add; }
  if (!add) { return existing; }
  return `${existing}\n${add}`;
}
