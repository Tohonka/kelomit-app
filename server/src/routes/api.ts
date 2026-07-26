import {Hono} from 'hono';
import {bearerAuth} from '../auth.ts';
import {ingestDatabase} from '../ingest.ts';
import {listMedia, saveMedia, isSafeMediaName} from '../media.ts';

export function apiRoutes(opts: {dataDir: string; token: string}): Hono {
  const app = new Hono();
  app.use('/api/*', bearerAuth(opts.token));

  app.get('/api/media/manifest', c => c.json({files: listMedia(opts.dataDir)}));

  app.post('/api/media/:filename', async c => {
    const name = c.req.param('filename');
    if (!isSafeMediaName(name)) {
      return c.json({error: 'bad filename'}, 400);
    }
    const body = Buffer.from(await c.req.arrayBuffer());
    saveMedia(opts.dataDir, name, body);
    return c.json({ok: true});
  });

  app.post('/api/sync', async c => {
    const body = Buffer.from(await c.req.arrayBuffer());
    try {
      await ingestDatabase(body, {dataDir: opts.dataDir});
    } catch (e) {
      return c.json({error: e instanceof Error ? e.message : String(e)}, 400);
    }
    return c.json({ok: true});
  });

  return app;
}
