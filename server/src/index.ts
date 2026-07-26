import {serve} from '@hono/node-server';
import {Hono} from 'hono';
import {apiRoutes} from './routes/api.ts';
import {webRoutes} from './routes/web.ts';
import {reportRoutes} from './routes/report.ts';

const dataDir = process.env.KELOMIT_DATA_DIR ?? '/data';
const token = process.env.KELOMIT_SYNC_TOKEN;
const port = Number(process.env.PORT ?? 8090);

if (!token) {
  throw new Error('KELOMIT_SYNC_TOKEN is required');
}

const app = new Hono();
app.route('/', apiRoutes({dataDir, token}));
app.route('/', reportRoutes({dataDir}));
app.route('/', webRoutes({dataDir}));
app.get('/healthz', c => c.text('ok'));

serve({fetch: app.fetch, port});
console.log(`kelomit server listening on ${port}, data=${dataDir}`);
