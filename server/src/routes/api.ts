import {Hono} from 'hono';
import type {Context} from 'hono';
import {bearerAuth} from '../auth.ts';
import {ingestDatabase} from '../ingest.ts';
import {listMedia, saveMedia, isSafeMediaName} from '../media.ts';

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
