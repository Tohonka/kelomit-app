const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Everything rendered comes from the phone, but escape anyway — a note body is
 *  free text and this is the only barrier. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch] ?? ch);
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Kelomit</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 46rem;
         padding: 1.5rem 1rem; line-height: 1.5; }
  a { color: inherit; }
  h1 { font-size: 1.5rem; }
  .day { display: flex; justify-content: space-between; padding: 0.75rem 0;
         border-bottom: 1px solid rgba(128,128,128,0.3); text-decoration: none; }
  .entry { padding: 0.75rem 0; border-bottom: 1px solid rgba(128,128,128,0.3); }
  .meta { font-size: 0.85rem; opacity: 0.7; }
  img { max-width: 100%; height: auto; border-radius: 0.5rem; }
  audio { width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** Media paths in the DB are absolute Android paths; the server stores files by
 *  basename. */
export function mediaUrl(filePath: string): string {
  return `/media/${esc(filePath.split('/').pop() ?? '')}`;
}
