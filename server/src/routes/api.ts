import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {Hono} from 'hono';
import type {Context} from 'hono';
import {bearerAuth} from '../auth.ts';
import {ingestDatabase} from '../ingest.ts';
import {listMedia, mediaPath, saveMedia, isSafeMediaName} from '../media.ts';

const MIME: Record<string, string> = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', m4a: 'audio/mp4', wav: 'audio/wav'};

// Real photos run ~2MB and the whole database ~1MB today; these caps are
// generous headroom, not a sizing guideline.
const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const MAX_DB_BYTES = 128 * 1024 * 1024;

/** Rejects a request whose Content-Length is missing or over `maxBytes`. Returns the 413 response, or null if the request is within bounds. */
function rejectIfOversized(c: Context, maxBytes: number): Response | null {
  const header = c.req.header('Content-Length');
  const length = header ? Number(header) : NaN;
  if (!Number.isFinite(length) || length > maxBytes) {
    return c.json({error: 'payload too large'}, 413);
  }
  return null;
}

export function apiRoutes(opts: {dataDir: string; token: string}): Hono {
  const app = new Hono();
  app.use('/api/*', bearerAuth(opts.token));

  app.get('/api/media/manifest', c => c.json({files: listMedia(opts.dataDir)}));

  /** The phone pulls a file the desktop companion staged for it (media.add). */
  app.get('/api/media/:filename', async c => {
    const name = c.req.param('filename');
    if (!isSafeMediaName(name)) {
      return c.json({error: 'bad filename'}, 400);
    }
    const path = mediaPath(opts.dataDir, name);
    if (!existsSync(path)) {
      return c.json({error: 'not found'}, 404);
    }
    const ext = name.split('.').pop()!.toLowerCase();
    return c.body(await readFile(path), 200, {'Content-Type': MIME[ext] ?? 'application/octet-stream'});
  });

  app.post('/api/media/:filename', async c => {
    const oversized = rejectIfOversized(c, MAX_MEDIA_BYTES);
    if (oversized) return oversized;
    const name = c.req.param('filename');
    if (!isSafeMediaName(name)) {
      return c.json({error: 'bad filename'}, 400);
    }
    const body = Buffer.from(await c.req.arrayBuffer());
    saveMedia(opts.dataDir, name, body);
    return c.json({ok: true});
  });

  app.post('/api/sync', async c => {
    const oversized = rejectIfOversized(c, MAX_DB_BYTES);
    if (oversized) return oversized;
    const body = Buffer.from(await c.req.arrayBuffer());
    try {
      await ingestDatabase(body, {dataDir: opts.dataDir});
    } catch (e) {
      console.error('sync ingest failed:', e);
      return c.json({error: 'invalid database upload'}, 400);
    }
    return c.json({ok: true});
  });

  return app;
}
