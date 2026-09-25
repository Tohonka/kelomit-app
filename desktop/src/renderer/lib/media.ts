import {mediaUrl} from '../panes/Media.tsx';
import type {StagedFile} from '../../main/media.ts';

export type MediaTarget = {entryId: number} | {date: string};

/** Video/audio length from the staged copy, for the `duration_sec` column the
 *  phone fills in from the recorder. Null when the browser can't read it. */
function mediaDuration(name: string): Promise<number | null> {
  const src = mediaUrl(name);
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const el = document.createElement('video');
    const done = (v: number | null) => {
      clearTimeout(t);
      el.removeAttribute('src');
      resolve(v);
    };
    const t = setTimeout(() => done(null), 4000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    el.onerror = () => done(null);
    el.src = src;
  });
}

/** Stage files on the Mac, then queue one `media.add` per file. `files` null =
 *  ask with an open-file dialog. */
export async function attachFiles(target: MediaTarget, files: File[] | null, label: string): Promise<void> {
  const {staged, skipped} = files ? await window.kelomit.mediaStage(files) : await window.kelomit.mediaPick();
  if (skipped.length > 0) {
    alert(`Skipped ${skipped.join(', ')} — the phone takes jpg, png, mp4, m4a and wav.`);
  }
  for (const f of staged) {
    const duration_sec = f.media_type === 'photo' ? null : await mediaDuration(f.name);
    await window.kelomit.cmd(
      'media.add',
      [target, {...f, duration_sec} satisfies StagedFile & {duration_sec: number | null}],
      `${label}: add ${f.media_type}`
    );
  }
}

export function droppedFiles(e: React.DragEvent): File[] {
  return Array.from(e.dataTransfer?.files ?? []);
}

export const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
