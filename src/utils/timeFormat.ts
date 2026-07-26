import {format, parseISO} from 'date-fns';

// Pure timestamp helpers, deliberately free of i18n. `dateUtils` re-exports
// them, so app code keeps importing from there — this module exists so the
// server can share `workReport` without dragging i18next/react-i18next (and
// therefore React Native) into its dependency graph.

/**
 * Parse a stored timestamp to a Date (absolute instant).
 * App-written values are ISO 8601 with a zone (`toISOString()` → ends in `Z`).
 * SQLite `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` in UTC with no zone
 * marker — without this it would be misread as local time and shown hours off.
 */
export function parseTimestamp(value: string): Date {
  if (value.includes('T')) {
    return parseISO(value);
  }
  return new Date(value.replace(' ', 'T') + 'Z');
}

/** Local YYYY-MM-DD for a stored timestamp (used for date grouping/headers). */
export function localDateOf(value: string): string {
  return format(parseTimestamp(value), 'yyyy-MM-dd');
}

export function formatTime(isoDatetime: string): string {
  return format(parseTimestamp(isoDatetime), 'HH:mm');
}
