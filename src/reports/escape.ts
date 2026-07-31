const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Everything rendered comes from the phone, but escape anyway — a note body is
 *  free text and this is the only barrier.
 *
 *  Lives here rather than in the server because templates are the shared side:
 *  `server/src/render.ts` re-exports it so there is exactly one escaper. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch] ?? ch);
}
