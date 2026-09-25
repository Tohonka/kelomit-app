// Dev aid: KELOMIT_REPORT_PDF=<out.pdf> prints last month's report from the
// current database headlessly and quits. Wired from index.ts.
import {app} from 'electron';
import {writeFileSync} from 'node:fs';
import {openCurrent} from '../../../server/src/db.ts';
import {buildModel, renderPdf, reportDefaults} from './report.ts';

export async function reportCheck(dataDir: string, out: string, from: string, to: string): Promise<void> {
  const db = openCurrent(dataDir);
  if (!db) throw new Error('no current.db');
  const model = buildModel(db, {...reportDefaults(db), from, to, person: 'Test Person', company: 'Test Oy'});
  writeFileSync(out, await renderPdf(model));
  app.quit();
}
