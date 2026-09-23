import {serve} from '@hono/node-server';
import type {ServerType} from '@hono/node-server';
import {apiRoutes} from '../../../server/src/routes/api.ts';
import {PORT} from './config.ts';

/**
 * The phone talks to the desktop exactly as it talks to the remote server:
 * same routes, same ingest, same media store. `apiRoutes` IS the app — no
 * second Hono instance wrapping it, so there is one copy of hono in play.
 */
export function startApiServer(dataDir: string, token: string): ServerType {
  const app = apiRoutes({dataDir, token});
  app.get('/healthz', c => c.text('ok'));
  const server = serve({fetch: app.fetch, port: PORT, hostname: '0.0.0.0'});
  console.log(`kelomit companion api on :${PORT}, data=${dataDir}`);
  return server;
}
