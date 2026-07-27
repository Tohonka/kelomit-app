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

/** Media paths in the DB are absolute Android paths; the server stores files by
 *  basename. */
export function mediaUrl(filePath: string): string {
  return `/media/${esc(filePath.split('/').pop() ?? '')}`;
}

// Palette lifted from the app's own src/theme/colors.ts ("liquid glass"
// synthwave, 2026-07). The activity hues are load-bearing, not decoration:
// work = pink, personal-at-work = amber, personal = cyan — same as the phone.
const CSS = `
:root {
  color-scheme: dark light;
  --bg: #090D16;
  --bg-card: #121824;
  --bg-muted: #242933;
  --swatch: #1D222B;
  --text: #EEF2F9;
  --text-secondary: #A4ABB8;
  --text-muted: #747A87;
  --border: #232B39;
  --work: #FB40AD;
  --personal-work: #EBA941;
  --personal: #1ACFDF;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #F2F5FB;
    --bg-card: #FAFCFF;
    --bg-muted: #DBDEE5;
    --swatch: #E7EAF1;
    --text: #11161F;
    --text-secondary: #505561;
    --text-muted: #6D727B;
    --border: #D0D4DC;
    --work: #D0268C;
    --personal-work: #B37000;
    --personal: #008695;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0 auto;
  max-width: 44rem;
  padding: 1.5rem 1rem 4rem;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: clamp(15px, 2.2vw, 17px);
  line-height: 1.45;
  font-feature-settings: "kern" 1, "liga" 1;
  text-rendering: optimizeLegibility;
}

a { color: inherit; text-decoration: none; }
a.link {
  color: var(--text-secondary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

h1 { font-size: 1.55rem; margin: 0 0 0.15rem; letter-spacing: -0.01em; }

/* Short all-caps labels, so they must be letterspaced. */
.section-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-muted);
  margin: 2rem 0 0.6rem;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  padding: 0.9rem 1rem;
  margin-bottom: 0.6rem;
}

.meta { font-size: 0.85rem; color: var(--text-muted); }
.num { font-variant-numeric: tabular-nums lining-nums; }
.empty { color: var(--text-muted); }

/* Day list */
.month {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-muted);
  margin: 1.75rem 0 0.6rem;
}
.day-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.7rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  margin-bottom: 0.4rem;
}
.day-row:hover { border-color: var(--work); }
.day-date { font-weight: 600; font-variant-numeric: tabular-nums; }
.day-grow { flex: 1; min-width: 0; }
.day-hours { font-weight: 600; font-variant-numeric: tabular-nums; }

.hours-big {
  font-size: 2.1rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  margin: 0.6rem 0 0;
  line-height: 1.1;
}
.hours-big + .meta { margin: 0.1rem 0 0; }

/* Split bar */
.bar {
  display: flex;
  height: 0.55rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--bg-muted);
  margin: 0.15rem 0 0.85rem;
}
.bar span { display: block; height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; }
.legend-item { display: flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; }
.dot { width: 0.6rem; height: 0.6rem; border-radius: 999px; flex: none; }

/* Entries */
.entry { border-left: 3px solid var(--border); }
.entry.work { border-left-color: var(--work); }
.entry.personal_work { border-left-color: var(--personal-work); }
.entry.personal { border-left-color: var(--personal); }
.entry-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.entry-title { font-weight: 600; }
.entry-time {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.entry-body { margin: 0.4rem 0 0; color: var(--text-secondary); white-space: pre-wrap; }
.day-sep { border-top: 1px solid var(--border); margin: 0.6rem 0; }

.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.55rem; }
.chip {
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--swatch);
  color: var(--text-secondary);
}
.chip.badge { color: var(--bg); font-weight: 600; }
.chip.work { background: var(--work); }
.chip.personal_work { background: var(--personal-work); }
.chip.personal { background: var(--personal); }

.shots { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.6rem; }
.shots img {
  width: calc(50% - 0.25rem);
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 0.6rem;
  display: block;
}
audio { width: 100%; margin-top: 0.6rem; }
.transcript {
  margin: 0.5rem 0 0;
  padding-left: 0.75rem;
  border-left: 2px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.92rem;
}

/* Route */
.trip { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.stop { display: flex; align-items: baseline; gap: 0.6rem; }
.stop::before {
  content: "";
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--personal);
  flex: none;
  transform: translateY(-0.1rem);
}

form.range { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
form.range input,
form.range button {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.7rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
}
form.range button {
  background: var(--work);
  color: var(--bg);
  font-weight: 600;
  border-color: transparent;
  cursor: pointer;
}
`;

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} &middot; Kelomit</title>
<style>${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}
