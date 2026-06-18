import RNFS from 'react-native-fs';
import {saveDocuments, errorCodes, isErrorWithCode} from '@react-native-documents/picker';
import {getDB} from '../db/database';
import i18n from '../i18n';

type RawRow = Record<string, unknown>;

function esc(v: unknown): string {
  if (v == null) {
    return '';
  }
  const s = String(v);
  // Wrap in quotes and escape any inner quotes
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADERS = [
  'date',
  'created_at',
  'time_from',
  'time_to',
  'duration_sec',
  'entry_type',
  'activity_type',
  'project_name',
  'project_type',
  'tags',
  'title',
  'body',
  'latitude',
  'longitude',
  'location_label',
];

export async function exportToCsv(
  startDate: string,
  endDate: string,
): Promise<void> {
  const db = getDB();

  const result = await db.execute(
    `SELECT
       d.date,
       e.created_at,
       e.time_from,
       e.time_to,
       e.duration_sec,
       e.entry_type,
       e.activity_type,
       p.name     AS project_name,
       p.type     AS project_type,
       e.title,
       e.body,
       e.latitude,
       e.longitude,
       e.location_label,
       e.id       AS entry_id
     FROM entries e
     JOIN days d ON d.id = e.day_id
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE d.date >= ? AND d.date <= ?
     ORDER BY d.date ASC, e.created_at ASC;`,
    [startDate, endDate],
  );

  const rows = (result.rows ?? []) as RawRow[];
  if (rows.length === 0) {
    throw new Error(i18n.t('settings.exportNoEntries'));
  }

  // Fetch tags for all entries in one query
  const entryIds = rows.map(r => r.entry_id as number);
  const placeholders = entryIds.map(() => '?').join(',');
  const tagResult = await db.execute(
    `SELECT et.entry_id, t.name
     FROM entry_tags et
     JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id IN (${placeholders});`,
    entryIds,
  );
  const tagsMap = new Map<number, string[]>();
  for (const tr of tagResult.rows ?? []) {
    const r = tr as RawRow;
    const id = r.entry_id as number;
    if (!tagsMap.has(id)) {
      tagsMap.set(id, []);
    }
    tagsMap.get(id)!.push(r.name as string);
  }

  const lines: string[] = [HEADERS.join(',')];
  for (const row of rows) {
    const entryId = row.entry_id as number;
    const tagStr = (tagsMap.get(entryId) ?? []).join(';');
    lines.push(
      [
        esc(row.date),
        esc(row.created_at),
        esc(row.time_from),
        esc(row.time_to),
        esc(row.duration_sec),
        esc(row.entry_type),
        esc(row.activity_type),
        esc(row.project_name),
        esc(row.project_type),
        esc(tagStr),
        esc(row.title),
        esc(row.body),
        esc(row.latitude),
        esc(row.longitude),
        esc(row.location_label),
      ].join(','),
    );
  }

  const csv = lines.join('\n');
  const filename = `kelomit_${startDate}_${endDate}.csv`;
  const filePath = `${RNFS.CachesDirectoryPath}/${filename}`;
  await RNFS.writeFile(filePath, csv, 'utf8');

  // Use the system "save to…" dialog (saveDocuments) — NOT RN's Share, whose
  // `url` is iOS-only and on Android shares only the message text, never the file.
  try {
    await saveDocuments({
      sourceUris: [`file://${filePath}`],
      mimeType: 'text/csv',
      fileName: filename,
      copy: true,
    });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return; // user dismissed the save dialog — not an error
    }
    throw e;
  }
}
