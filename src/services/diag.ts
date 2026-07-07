import RNFS from 'react-native-fs';
import {getDB} from '../db/database';

/**
 * On-device diagnostics. One hook — `logDiag(tag, msg, data?)` — writes to two
 * sinks that answer different questions:
 *
 *  - the flat `diag.log` file (`RNFS.DocumentDirectoryPath`, the same dir the
 *    native FGS's DiagLog.kt appends to): a single cross-language, chronological
 *    timeline that survives process death — the primary export.
 *  - the `diag_log` sqlite table: the JS-side structured/queryable half, so a
 *    weird bug can be sliced later without grepping the file.
 *
 * Diagnostics must never break the app, so every write is best-effort and
 * swallows its own errors. Callers should NOT await in hot paths — fire and
 * forget: `void logDiag(...)`.
 *
 * ponytail: caps are generous (space isn't a concern) — tune here if needed.
 */
const LOG_FILE = `${RNFS.DocumentDirectoryPath}/diag.log`;
const FILE_CAP_BYTES = 3 * 1024 * 1024; // ~3 MB, head-trimmed to half when exceeded
const RETENTION_DAYS = 21; // sqlite rows older than this are pruned on init

function iso(): string {
  return new Date().toISOString();
}

/** Append one line to the flat file, head-trimming when it outgrows the cap.
 *  ponytail: JS and native FGS append to this file from the same process but
 *  different threads with no cross-language lock — a rare interleaved/garbled
 *  line or a lost trim is acceptable for a debug log; add a lock only if it
 *  actually corrupts analysis. */
async function appendToFile(line: string): Promise<void> {
  try {
    const stat = await RNFS.stat(LOG_FILE).catch(() => null);
    if (stat && Number(stat.size) > FILE_CAP_BYTES) {
      const whole = await RNFS.readFile(LOG_FILE, 'utf8');
      const half = whole.slice(Math.floor(whole.length / 2));
      // Drop the partial first line left by the mid-string cut.
      const trimmed = half.slice(half.indexOf('\n') + 1);
      await RNFS.writeFile(LOG_FILE, `--- trimmed ${iso()} ---\n${trimmed}`, 'utf8');
    }
    await RNFS.appendFile(LOG_FILE, `${line}\n`, 'utf8');
  } catch {
    // best-effort
  }
}

/**
 * Record a diagnostic event. `tag` is a short dotted key (e.g. 'watch.stall'),
 * `msg` a human line, `data` an optional JSON-able bag of fields.
 */
export async function logDiag(
  tag: string,
  msg: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const ts = iso();
  const dataStr = data ? JSON.stringify(data) : null;
  const fileLine = `${ts} JS  ${tag} ${msg}${dataStr ? ' ' + dataStr : ''}`;
  await appendToFile(fileLine);
  try {
    await getDB().execute(
      'INSERT INTO diag_log (ts, source, tag, msg, data) VALUES (?, ?, ?, ?, ?);',
      [ts, 'JS', tag, msg, dataStr],
    );
  } catch {
    // best-effort
  }
}

/**
 * Fire-and-forget hook — the one to call from hot paths and from any future
 * feature that wants to "tap in". Never awaits, never throws, never floats a
 * promise past the linter.
 */
export function diag(tag: string, msg: string, data?: Record<string, unknown>): void {
  logDiag(tag, msg, data).catch(() => {});
}

/** Prune old sqlite rows. Call once on startup. The flat file self-trims. */
export async function pruneDiagLog(days = RETENTION_DAYS): Promise<void> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  try {
    await getDB().execute('DELETE FROM diag_log WHERE ts < ?;', [cutoff]);
  } catch {
    // best-effort
  }
}

/** For the Diagnostics settings screen: file path, size, and sqlite row count. */
export async function diagStats(): Promise<{path: string; sizeBytes: number; rows: number}> {
  const stat = await RNFS.stat(LOG_FILE).catch(() => null);
  let rows = 0;
  try {
    const res = await getDB().execute('SELECT COUNT(*) AS n FROM diag_log;');
    rows = (res.rows?.[0] as {n: number} | undefined)?.n ?? 0;
  } catch {
    // best-effort
  }
  return {path: LOG_FILE, sizeBytes: stat ? Number(stat.size) : 0, rows};
}

/** Wipe both sinks. */
export async function clearDiag(): Promise<void> {
  try {
    await RNFS.writeFile(LOG_FILE, '', 'utf8');
  } catch {
    // best-effort
  }
  try {
    await getDB().execute('DELETE FROM diag_log;');
  } catch {
    // best-effort
  }
}

export const DIAG_LOG_FILE = LOG_FILE;
