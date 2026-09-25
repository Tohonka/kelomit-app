import { ipcMain, dialog, app, shell, BrowserWindow, Menu, protocol, net, nativeTheme } from "electron";
import { pathToFileURL } from "node:url";
import { existsSync, readdirSync, mkdirSync, writeFileSync, statSync, copyFileSync, readFileSync, rmSync, renameSync, watch } from "node:fs";
import { join, extname } from "node:path";
import Database from "better-sqlite3";
import { parseISO, format, differenceInSeconds, eachDayOfInterval } from "date-fns";
import { fi, enUS } from "date-fns/locale";
import { networkInterfaces } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { EventEmitter } from "node:events";
import { WebSocketServer, WebSocket } from "ws";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "wav", "m4a", "mp4"];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
function isSafeMediaName(name) {
  if (!name || name.length > 200 || !SAFE_NAME.test(name) || name.includes("..")) {
    return false;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext !== name.toLowerCase() && ALLOWED_EXTENSIONS.includes(ext);
}
function mediaPath(dataDir, name) {
  if (!isSafeMediaName(name)) {
    throw new Error(`unsafe media name: ${name}`);
  }
  return join(dataDir, "media", name);
}
function listMedia(dataDir) {
  const dir = join(dataDir, "media");
  return existsSync(dir) ? readdirSync(dir) : [];
}
function saveMedia(dataDir, name, body) {
  const path = mediaPath(dataDir, name);
  mkdirSync(join(dataDir, "media"), { recursive: true });
  writeFileSync(path, body);
}
let cached = null;
function openCurrent(dataDir) {
  const path = join(dataDir, "current.db");
  if (!existsSync(path)) {
    return null;
  }
  const { ino, size, mtimeMs } = statSync(path);
  if (cached && cached.path === path && cached.ino === ino && cached.size === size && cached.mtimeMs === mtimeMs) {
    return cached.db;
  }
  cached?.db.close();
  const db = new Database(path, { readonly: true, fileMustExist: true });
  cached = { path, ino, size, mtimeMs, db };
  return db;
}
function hasTable(db, name) {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) != null;
}
function getDay(db, date) {
  const row = db.prepare("SELECT * FROM days WHERE date = ?").get(date);
  if (row) return row;
  return getLeaveRangesInRange(db, date, date).length > 0 ? {
    id: -1,
    date,
    started_at: null,
    ended_at: null,
    started_at_2: null,
    ended_at_2: null,
    started_at_source: null,
    ended_at_source: null,
    notes: null,
    created_at: "",
    updated_at: ""
  } : null;
}
function tagsByEntry(db, scope, params) {
  const rows = db.prepare(
    `SELECT et.entry_id AS entryId, t.id AS id, t.name AS name,
              t.created_at AS created_at
         FROM entry_tags et
         JOIN tags t ON t.id = et.tag_id
         JOIN entries e ON e.id = et.entry_id
        WHERE ${scope}
        ORDER BY t.name COLLATE NOCASE`
  ).all(...params);
  const map = /* @__PURE__ */ new Map();
  for (const { entryId, ...tag } of rows) {
    const list = map.get(entryId);
    if (list) {
      list.push(tag);
    } else {
      map.set(entryId, [tag]);
    }
  }
  return map;
}
function loadEntries(db, scope, params) {
  const rows = db.prepare(
    `SELECT e.*,
              p.name AS project_name,
              p.type AS project_type,
              p.archived AS project_archived,
              p.created_at AS project_created_at,
              p.updated_at AS project_updated_at
         FROM entries e
         LEFT JOIN projects p ON p.id = e.project_id
        WHERE ${scope}
        ORDER BY COALESCE(e.time_from, e.created_at)`
  ).all(...params);
  const tags = tagsByEntry(db, scope, params);
  return rows.map(
    ({
      project_name,
      project_type,
      project_archived,
      project_created_at,
      project_updated_at,
      ...entry
    }) => ({
      ...entry,
      is_overtime: Boolean(entry.is_overtime),
      is_small_task: Boolean(entry.is_small_task),
      tags: tags.get(entry.id) ?? [],
      project: entry.project_id != null && project_type != null ? {
        id: entry.project_id,
        name: project_name ?? "",
        type: project_type,
        archived: Boolean(project_archived),
        created_at: project_created_at ?? "",
        updated_at: project_updated_at ?? ""
      } : null
    })
  );
}
function getEntries(db, dayId) {
  return loadEntries(db, "e.day_id = ?", [dayId]);
}
function getEntriesInRange(db, from, to) {
  return loadEntries(
    db,
    "e.day_id IN (SELECT id FROM days WHERE date >= ? AND date <= ?)",
    [from, to]
  );
}
function getDaysInRange(db, from, to) {
  return db.prepare("SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date").all(from, to);
}
function getLeaveRangesInRange(db, from, to) {
  if (!hasTable(db, "leave_ranges")) return [];
  return db.prepare(
    `SELECT * FROM leave_ranges
      WHERE start_date <= ? AND end_date >= ?
      ORDER BY start_date, id`
  ).all(to, from);
}
function getSetting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? null;
}
function getEntryMedia(db, dayId) {
  return db.prepare(
    `SELECT m.id, m.entry_id, m.media_type, m.file_path, m.thumbnail_path,
              m.duration_sec, m.transcript
         FROM entry_media m
         JOIN entries e ON e.id = m.entry_id
        WHERE e.day_id = ?
        ORDER BY m.entry_id, m.position`
  ).all(dayId);
}
function getRouteSegments(db, dayId) {
  return db.prepare(
    `SELECT sequence, start_ts, end_ts, coordinates_json,
              distance_m, duration_sec, average_speed_mps
         FROM day_route_segments WHERE day_id = ? ORDER BY sequence`
  ).all(dayId);
}
function getRouteStops(db, dayId) {
  return db.prepare(
    `SELECT start_ts, end_ts, latitude, longitude, display_name
         FROM day_route_stops WHERE day_id = ? ORDER BY start_ts`
  ).all(dayId);
}
const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}
function reportDocument(template, model, options = {}) {
  const page = options.pageMargin ? `@page { size: A4; margin: ${template.marginPt}pt; }` : "@page { size: A4; }";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(model.meta.title)}</title>
<style>
${page}
html, body { margin: 0; padding: 0; background: #FFFFFF; }
/* The app ellipsizes overlong labels to keep its hand-drawn columns aligned.
   Here the browser wraps them instead — same content, no truncation. */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
h1, h2, h3 { break-after: avoid; }
${template.css}
</style>
</head>
<body>${template.html(model)}</body>
</html>`;
}
function parseTimestamp(value) {
  if (value.includes("T")) {
    return parseISO(value);
  }
  return /* @__PURE__ */ new Date(value.replace(" ", "T") + "Z");
}
function formatTime(isoDatetime) {
  return format(parseTimestamp(isoDatetime), "HH:mm");
}
function entryTrackedSeconds(entry) {
  if (entry.is_todo && !entry.completed_at) {
    return 0;
  }
  if (entry.duration_sec != null) {
    return Math.max(0, entry.duration_sec);
  }
  if (entry.time_from && entry.time_to) {
    const s = differenceInSeconds(parseISO(entry.time_to), parseISO(entry.time_from));
    return s > 0 ? s : 0;
  }
  return 0;
}
function epoch(iso) {
  return Math.round(new Date(iso).getTime() / 1e3);
}
function merge(ivs) {
  const sorted = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) {
      last[1] = Math.max(last[1], b);
    } else {
      out.push([a, b]);
    }
  }
  return out;
}
function totalLength(ivs) {
  return merge(ivs).reduce((sum, [a, b]) => sum + (b - a), 0);
}
function intersect(iv, m) {
  const out = [];
  for (const [c, d] of m) {
    const s = Math.max(iv[0], c);
    const e = Math.min(iv[1], d);
    if (e > s) {
      out.push([s, e]);
    }
  }
  return out;
}
function subtract(iv, m) {
  const out = [];
  let cursor = iv[0];
  for (const [c, d] of m) {
    if (d <= cursor || c >= iv[1]) {
      continue;
    }
    if (c > cursor) {
      out.push([cursor, Math.min(c, iv[1])]);
    }
    cursor = Math.max(cursor, d);
    if (cursor >= iv[1]) {
      break;
    }
  }
  if (cursor < iv[1]) {
    out.push([cursor, iv[1]]);
  }
  return out;
}
function entryInterval$1(e) {
  if (e.is_todo && !e.completed_at) {
    return null;
  }
  if (e.time_from && e.time_to) {
    const a = epoch(e.time_from);
    const b = epoch(e.time_to);
    return b > a ? [a, b] : null;
  }
  return null;
}
function dayWorkActivity(entry) {
  return entry.project?.type === "personal" ? "personal" : entry.activity_type;
}
function calcDayWorkBreakdown(day, entries) {
  const legs = [];
  if (day.started_at && day.ended_at) {
    legs.push([epoch(day.started_at), epoch(day.ended_at)]);
  }
  if (day.started_at_2 && day.ended_at_2) {
    legs.push([epoch(day.started_at_2), epoch(day.ended_at_2)]);
  }
  const legUnion = merge(legs);
  if (legUnion.length === 0) {
    let workSeconds2 = 0;
    for (const entry of entries) {
      if (entry.parent_id != null) {
        continue;
      }
      const activity = dayWorkActivity(entry);
      if (activity === "work" || activity === "personal_work") {
        workSeconds2 += entryTrackedSeconds(entry);
      }
    }
    return {
      baselineSeconds: 0,
      addedWorkSeconds: 0,
      deductedPersonalSeconds: 0,
      workSeconds: workSeconds2,
      hasDayLegs: false
    };
  }
  const baseline = totalLength(legUnion);
  const workOutside = [];
  const personalInside = [];
  let addedDurationWork = 0;
  let deductedDurationPersonal = 0;
  for (const e of entries) {
    const activity = dayWorkActivity(e);
    const iv = entryInterval$1(e);
    if (e.parent_id != null && (activity !== "personal" || !iv)) {
      continue;
    }
    if (iv) {
      if (activity === "work") {
        workOutside.push(...subtract(iv, legUnion));
      } else if (activity === "personal") {
        personalInside.push(...intersect(iv, legUnion));
      }
    } else {
      const secs = entryTrackedSeconds(e);
      if (secs > 0) {
        if (activity === "work") {
          addedDurationWork += secs;
        } else if (activity === "personal") {
          deductedDurationPersonal += secs;
        }
      }
    }
  }
  const addedWorkSeconds = totalLength(workOutside) + addedDurationWork;
  const deductedPersonalSeconds = totalLength(personalInside) + deductedDurationPersonal;
  const workSeconds = Math.max(0, baseline + addedWorkSeconds - deductedPersonalSeconds);
  return {
    baselineSeconds: baseline,
    addedWorkSeconds,
    deductedPersonalSeconds,
    workSeconds,
    hasDayLegs: true
  };
}
function calcDayWorkSecs(day, entries) {
  return calcDayWorkBreakdown(day, entries).workSeconds;
}
function mergeIntervals(intervals) {
  const sorted = intervals.filter(([start, end]) => end > start).sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }
  return merged;
}
function intervalSeconds(intervals) {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + end - start, 0);
}
function entryInterval(entry) {
  if (entry.is_todo && !entry.completed_at || !entry.time_from || !entry.time_to) {
    return null;
  }
  const start = Math.round(Date.parse(entry.time_from) / 1e3);
  const end = Math.round(Date.parse(entry.time_to) / 1e3);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
}
function overlapSeconds(left, right) {
  const overlaps = [];
  for (const [leftStart, leftEnd] of mergeIntervals(left)) {
    for (const [rightStart, rightEnd] of mergeIntervals(right)) {
      const start = Math.max(leftStart, rightStart);
      const end = Math.min(leftEnd, rightEnd);
      if (end > start) {
        overlaps.push([start, end]);
      }
    }
  }
  return intervalSeconds(overlaps);
}
function reportLeavesByDate(ranges, startDate, endDate) {
  const result = {};
  for (const range of ranges) {
    const start = range.start_date < startDate ? startDate : range.start_date;
    const end = range.end_date > endDate ? endDate : range.end_date;
    if (start > end) continue;
    for (const day of eachDayOfInterval({ start: parseISO(start), end: parseISO(end) })) {
      (result[format(day, "yyyy-MM-dd")] ??= []).push(range);
    }
  }
  return result;
}
function classifyReportDay(day, entries, hasLeave) {
  const eligibleWork = entries.filter(
    (entry) => entry.activity_type === "work" && entry.parent_id == null && // subnotes ride inside their parent
    entry.project?.type !== "personal" && (!entry.is_todo || entry.completed_at != null)
  );
  const overtimeIntervals = [];
  const normalIntervals = [];
  let overtimeDuration = 0;
  let normalDuration = 0;
  for (const entry of eligibleWork) {
    const interval = entryInterval(entry);
    if (interval) {
      (entry.is_overtime ? overtimeIntervals : normalIntervals).push(interval);
    } else {
      const seconds = entryTrackedSeconds(entry);
      if (entry.is_overtime) {
        overtimeDuration += seconds;
      } else {
        normalDuration += seconds;
      }
    }
  }
  const overtimeSeconds = intervalSeconds(overtimeIntervals) + overtimeDuration;
  if (hasLeave) {
    const remoteOtherSeconds = Math.max(
      0,
      intervalSeconds(normalIntervals) - overlapSeconds(normalIntervals, overtimeIntervals) + normalDuration
    );
    return {
      regularSeconds: 0,
      remoteOtherSeconds,
      overtimeSeconds,
      totalSeconds: remoteOtherSeconds + overtimeSeconds
    };
  }
  const breakdown2 = calcDayWorkBreakdown(day, entries);
  const legs = [];
  if (day.started_at && day.ended_at) {
    legs.push([
      Math.round(Date.parse(day.started_at) / 1e3),
      Math.round(Date.parse(day.ended_at) / 1e3)
    ]);
  }
  if (day.started_at_2 && day.ended_at_2) {
    legs.push([
      Math.round(Date.parse(day.started_at_2) / 1e3),
      Math.round(Date.parse(day.ended_at_2) / 1e3)
    ]);
  }
  const personalIntervals = entries.filter(
    (entry) => entry.activity_type === "personal" || entry.project?.type === "personal"
  ).map(entryInterval).filter((interval) => interval != null);
  const regularBeforeOvertime = Math.max(
    0,
    intervalSeconds(legs) - overlapSeconds(legs, personalIntervals)
  );
  const classifiedOvertime = Math.min(overtimeSeconds, breakdown2.workSeconds);
  const regularSeconds = Math.min(
    Math.max(0, regularBeforeOvertime - overlapSeconds(legs, overtimeIntervals)),
    breakdown2.workSeconds - classifiedOvertime
  );
  return {
    regularSeconds,
    remoteOtherSeconds: Math.max(
      0,
      breakdown2.workSeconds - regularSeconds - classifiedOvertime
    ),
    overtimeSeconds: classifiedOvertime,
    totalSeconds: breakdown2.workSeconds
  };
}
const COPY = {
  en: {
    title: "Work hours report",
    total: "Total worked",
    date: "Date",
    workTime: "Work time",
    regular: "Hours",
    remoteOther: "Remote / Other",
    overtime: "Overtime",
    totalColumn: "Total",
    leave: {
      paid_day_off: "Day off (paid)",
      unpaid_day_off: "Day off (unpaid)",
      vacation: "Vacation",
      sick: "Sick"
    },
    statistics: "Statistics",
    byProject: "By project",
    byTag: "By tag",
    untracked: "Untracked work",
    nonExclusive: "Tag totals are non-exclusive.",
    page: "Page"
  },
  fi: {
    title: "Työaikaraportti",
    total: "Tunteja yhteensä",
    date: "Päivä",
    workTime: "Työaika",
    regular: "Tunnit",
    remoteOther: "Etä / muu",
    overtime: "Ylityö",
    totalColumn: "Yhteensä",
    leave: {
      paid_day_off: "Vapaa (palkallinen)",
      unpaid_day_off: "Vapaa (palkaton)",
      vacation: "Loma",
      sick: "Sairaus"
    },
    statistics: "Tilastot",
    byProject: "Projekteittain",
    byTag: "Tunnisteittain",
    untracked: "Kohdistamaton työ",
    nonExclusive: "Tunnisteiden tunnit eivät sulje toisiaan pois.",
    page: "Sivu"
  }
};
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
function workTime(day) {
  return [
    [day.started_at, day.ended_at],
    [day.started_at_2, day.ended_at_2]
  ].filter((period) => Boolean(period[0] && period[1])).map(([start, end]) => `${formatTime(start)}–${formatTime(end)}`).join(" · ");
}
function headlines(entries) {
  return entries.filter((entry) => entry.activity_type === "work" && entry.project?.type !== "personal" && (!entry.is_todo || entry.completed_at != null) && entry.title?.trim()).sort((a, b) => parseTimestamp(a.time_from ?? a.created_at).getTime() - parseTimestamp(b.time_from ?? b.created_at).getTime() || a.id - b.id).map((entry) => entry.title.trim());
}
function addSeconds(group, label, seconds) {
  group.set(label, (group.get(label) ?? 0) + seconds);
}
function allocationRows(group, language) {
  return [...group].filter(([, seconds]) => seconds > 0).sort(([leftLabel, leftSeconds], [rightLabel, rightSeconds]) => rightSeconds - leftSeconds || leftLabel.localeCompare(rightLabel, language)).map(([label, seconds]) => ({ label, seconds, hours: formatDuration(seconds) }));
}
function buildStatistics(days, totalSeconds, language) {
  const copy = COPY[language];
  const projects = /* @__PURE__ */ new Map();
  const tags = /* @__PURE__ */ new Map();
  let projectAllocatedSeconds = 0;
  let tagAllocatedSeconds = 0;
  for (const { entries } of days) {
    for (const entry of entries) {
      if (entry.activity_type !== "work" || entry.project?.type === "personal" || entry.parent_id != null) {
        continue;
      }
      const seconds = entryTrackedSeconds(entry);
      if (seconds <= 0) {
        continue;
      }
      if (entry.project) {
        addSeconds(projects, entry.project.name, seconds);
        projectAllocatedSeconds += seconds;
      }
      if (entry.tags && entry.tags.length > 0) {
        tagAllocatedSeconds += seconds;
        for (const tag of entry.tags) {
          addSeconds(tags, tag.name, seconds);
        }
      }
    }
  }
  const projectRows = allocationRows(projects, language);
  const tagRows = allocationRows(tags, language);
  const projectUntracked = Math.max(0, totalSeconds - projectAllocatedSeconds);
  const tagUntracked = Math.max(0, totalSeconds - tagAllocatedSeconds);
  if (projectUntracked > 0) {
    projectRows.push({ label: copy.untracked, seconds: projectUntracked, hours: formatDuration(projectUntracked) });
  }
  if (tagUntracked > 0) {
    tagRows.push({ label: copy.untracked, seconds: tagUntracked, hours: formatDuration(tagUntracked) });
  }
  return {
    title: copy.statistics,
    byProjectTitle: copy.byProject,
    byTagTitle: copy.byTag,
    nonExclusiveNote: copy.nonExclusive,
    projectRows,
    tagRows
  };
}
function buildWorkReport(input) {
  const personName = input.personName.trim();
  const companyName = input.companyName.trim();
  if (!personName) {
    throw new Error("report_person_required");
  }
  if (!companyName) {
    throw new Error("report_company_required");
  }
  if (input.startDate > input.endDate) {
    throw new Error("report_invalid_range");
  }
  const copy = COPY[input.language];
  const locale = input.language === "fi" ? fi : enUS;
  const leaveByDate = reportLeavesByDate(
    input.leaveRanges,
    input.startDate,
    input.endDate
  );
  const entriesByDay = /* @__PURE__ */ new Map();
  for (const entry of input.entries) {
    const entries = entriesByDay.get(entry.day_id) ?? [];
    entries.push(entry);
    entriesByDay.set(entry.day_id, entries);
  }
  const daysByDate = new Map(input.days.filter((day) => day.date >= input.startDate && day.date <= input.endDate).map((day) => [day.date, day]));
  const reportDates = [.../* @__PURE__ */ new Set([
    ...daysByDate.keys(),
    ...Object.keys(leaveByDate)
  ])].sort();
  const reportDays = reportDates.flatMap((date) => {
    const day = daysByDate.get(date);
    const leave = leaveByDate[date] ?? [];
    const entries = day ? entriesByDay.get(day.id) ?? [] : [];
    const emptyDay = {
      id: -1,
      date,
      started_at: null,
      ended_at: null,
      started_at_2: null,
      ended_at_2: null,
      started_at_source: null,
      ended_at_source: null,
      notes: null,
      created_at: "",
      updated_at: ""
    };
    const sourceDay = day ?? emptyDay;
    const buckets = classifyReportDay(sourceDay, entries, leave.length > 0);
    return buckets.totalSeconds > 0 || leave.length > 0 ? [{ day: sourceDay, entries, leave, buckets }] : [];
  });
  if (reportDays.length === 0) {
    throw new Error("report_empty");
  }
  const days = reportDays.map(({ day, entries, leave, buckets }) => ({
    date: input.language === "fi" ? format(parseISO(day.date), "EEEEEE d.M. yyyy", { locale }).replace(/^\S+/, (weekday) => weekday.toUpperCase()) : format(parseISO(day.date), "EEE d.M. yyyy", { locale }),
    workTime: leave.length > 0 ? leave.map((item) => copy.leave[item.type]).join(" + ") : workTime(day),
    regular: formatDuration(buckets.regularSeconds),
    regularSeconds: buckets.regularSeconds,
    remoteOther: formatDuration(buckets.remoteOtherSeconds),
    remoteOtherSeconds: buckets.remoteOtherSeconds,
    overtime: formatDuration(buckets.overtimeSeconds),
    overtimeSeconds: buckets.overtimeSeconds,
    total: formatDuration(buckets.totalSeconds),
    totalSeconds: buckets.totalSeconds,
    headlines: input.type === "headlines" || input.type === "statistics" ? headlines(entries) : []
  }));
  const totalSeconds = reportDays.reduce(
    (total, day) => total + day.buckets.totalSeconds,
    0
  );
  const range = `${format(parseISO(input.startDate), "d MMM yyyy", { locale })} – ${format(parseISO(input.endDate), "d MMM yyyy", { locale })}`;
  return {
    meta: {
      personName,
      companyName,
      range,
      title: copy.title,
      totalLabel: copy.total,
      totalHours: formatDuration(totalSeconds),
      pageLabel: copy.page
    },
    columns: {
      date: copy.date,
      workTime: copy.workTime,
      regular: copy.regular,
      remoteOther: copy.remoteOther,
      overtime: copy.overtime,
      total: copy.totalColumn
    },
    days,
    statistics: input.type === "statistics" ? buildStatistics(reportDays, totalSeconds, input.language) : null
  };
}
const NAVY = "#193047";
const BLUE = "#2B6CB0";
const PALE_BLUE = "#E8F2FB";
const DIVIDER = "#D6E0EA";
const PAGE_MARGIN_PT = 42;
const COLUMN_WIDTHS_PT = [88, 104, 58, 88, 58, 68];
const TABLE_WIDTH_PT = COLUMN_WIDTHS_PT.reduce((a, b) => a + b, 0);
const NAVY_TEXT = NAVY;
const SHEET_CSS = `
.sheet {
  color: ${NAVY};
  /* Android draws with Roboto; Noto Sans is the closest thing an Alpine image
     has. Metrics differ slightly, so the sheet wraps text rather than
     ellipsizing it — see the note in reportDocument(). */
  font-family: 'Noto Sans', 'Liberation Sans', 'DejaVu Sans', system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.35;
}
.sheet h1 { font-size: 20pt; line-height: 25pt; margin: 0; font-weight: 700; }
.sheet-rule { height: 3pt; background: ${BLUE}; margin-top: 8pt; }
.sheet-ident { margin-top: 25pt; }
.sheet-ident p { margin: 0; }
.sheet-company { font-size: 13pt; line-height: 18pt; font-weight: 700; }
.sheet-person { font-size: 11pt; line-height: 17pt; }
.sheet-range { font-size: 10pt; line-height: 15pt; }
.sheet-total {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  background: ${PALE_BLUE};
  min-height: 58pt;
  margin-top: 16pt;
  padding: 13pt 14pt 0;
}
.sheet-total-label { font-size: 10pt; }
.sheet-total-hours {
  font-size: 25pt;
  line-height: 25pt;
  font-weight: 700;
  color: ${BLUE};
  align-self: flex-end;
  padding-bottom: 8pt;
  white-space: nowrap;
}
/* Column widths, the table's right edge and the 5pt cell gap are
   WorkReportLayout's own constants — the table stops well short of the right
   margin on paper, exactly as the app draws it. */
.sheet-table {
  table-layout: fixed;
  width: ${TABLE_WIDTH_PT}pt;
  border-collapse: collapse;
  margin-top: 18pt;
  line-height: 11pt;
}
${COLUMN_WIDTHS_PT.map(
  (w, i) => `.sheet-table col:nth-child(${i + 1}) { width: ${w}pt; }`
).join("\n")}
.sheet-table th {
  background: ${PALE_BLUE};
  font-size: 8pt;
  font-weight: 700;
  text-align: left;
  height: 32pt;
  padding: 5.5pt 5pt 0 0;
  vertical-align: top;
}
.sheet-table th.right, .sheet-table td.right { text-align: right; }
/* 28pt is the app's minimum row height; a wrapped date or work-time grows it. */
.sheet-table td { font-size: 9pt; height: 28pt; padding: 6pt 5pt 0 0; vertical-align: top; }
/* Durations sit lower in the row than the date, as on paper. */
.sheet-table td.right { font-size: 8.5pt; padding-top: 10.5pt; }
.sheet-table td.total { font-weight: 700; }
/* One day = its row plus the headline row underneath. The hairline closes the
   pair, so it belongs to the LAST row of the group. */
.sheet-table tr.close td { padding-bottom: 4pt; border-bottom: 0.75pt solid ${DIVIDER}; }
/* Each day is its own tbody, so this keeps a date row and its headlines on the
   same page. A day taller than a page still breaks — the engine ignores
   break-inside when it has no choice. */
.sheet-table tbody { break-inside: avoid; }
.sheet-table td.headlines { height: auto; padding: 0 0 5pt; }
.sheet-headlines { list-style: none; margin: 0; padding: 0; }
.sheet-headlines li {
  font-size: 9.5pt;
  line-height: 14pt;
  padding-left: 22pt;
  position: relative;
}
.sheet-headlines li::before {
  content: '';
  position: absolute;
  left: 8pt;
  top: 5pt;
  width: 4pt;
  height: 4pt;
  background: ${BLUE};
}
.sheet-stats { break-before: page; padding-top: 12pt; }
.sheet-stats h2 { font-size: 20pt; line-height: 24pt; margin: 0 0 14pt; font-weight: 700; }
.sheet-stats h3 { font-size: 13pt; line-height: 18pt; margin: 18pt 0 7pt; font-weight: 700; }
.sheet-stats h3:first-of-type { margin-top: 0; }
.sheet-note { font-size: 9pt; font-style: italic; margin: 0 0 7pt; }
.sheet-alloc { break-inside: avoid; margin-bottom: 6pt; }
.sheet-alloc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  font-size: 9.5pt;
  line-height: 14pt;
}
.sheet-alloc-head b { font-weight: 700; white-space: nowrap; }
.sheet-bar { height: 7pt; background: ${PALE_BLUE}; margin-top: 3pt; }
.sheet-bar span { display: block; height: 100%; background: ${BLUE}; }
.num { font-variant-numeric: tabular-nums lining-nums; }
`;
function allocRows(list) {
  const max = list.reduce((m, r) => Math.max(m, r.seconds), 0);
  return list.map((r) => {
    const pct = max > 0 ? r.seconds / max * 100 : 0;
    return `<div class="sheet-alloc">
        <div class="sheet-alloc-head"><span>${esc(r.label)}</span><b class="num">${esc(r.hours)}</b></div>
        <div class="sheet-bar"><span style="width:${pct.toFixed(2)}%"></span></div>
      </div>`;
  }).join("");
}
function sheetHtml(model) {
  const rows = model.days.map((d) => {
    const headlines2 = d.headlines.length ? `<ul class="sheet-headlines">${d.headlines.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : "";
    return `<tbody><tr${headlines2 ? "" : ' class="close"'}>
          <td>${esc(d.date)}</td>
          <td>${esc(d.workTime)}</td>
          <td class="right num">${esc(d.regular)}</td>
          <td class="right num">${esc(d.remoteOther)}</td>
          <td class="right num">${esc(d.overtime)}</td>
          <td class="right total num">${esc(d.total)}</td>
        </tr>` + (headlines2 ? `<tr class="close"><td class="headlines" colspan="6">${headlines2}</td></tr>` : "") + "</tbody>";
  }).join("");
  const stats = model.statistics ? `<section class="sheet-stats">
        <h2>${esc(model.statistics.title)}</h2>
        <h3>${esc(model.statistics.byProjectTitle)}</h3>
        ${allocRows(model.statistics.projectRows)}
        <h3>${esc(model.statistics.byTagTitle)}</h3>
        <p class="sheet-note">${esc(model.statistics.nonExclusiveNote)}</p>
        ${allocRows(model.statistics.tagRows)}
      </section>` : "";
  return `<article class="sheet">
    <h1>${esc(model.meta.title)}</h1>
    <div class="sheet-rule"></div>
    <div class="sheet-ident">
      <p class="sheet-company">${esc(model.meta.companyName)}</p>
      <p class="sheet-person">${esc(model.meta.personName)}</p>
      <p class="sheet-range">${esc(model.meta.range)}</p>
    </div>
    <div class="sheet-total">
      <span class="sheet-total-label">${esc(model.meta.totalLabel)}</span>
      <span class="sheet-total-hours num">${esc(model.meta.totalHours)}</span>
    </div>
    <table class="sheet-table">
      <colgroup><col><col><col><col><col><col></colgroup>
      <thead>
        <tr>
          <th>${esc(model.columns.date)}</th>
          <th>${esc(model.columns.workTime)}</th>
          <th class="right">${esc(model.columns.regular)}</th>
          <th class="right">${esc(model.columns.remoteOther)}</th>
          <th class="right">${esc(model.columns.overtime)}</th>
          <th class="right">${esc(model.columns.total)}</th>
        </tr>
      </thead>
      ${rows}
    </table>
    ${stats}
  </article>`;
}
function footerTemplate(model) {
  const identity = `${model.meta.companyName} · ${model.meta.personName}`;
  return `<div style="width:100%;margin:0 ${PAGE_MARGIN_PT}pt;font-family:'Noto Sans',sans-serif;font-size:9pt;color:${NAVY_TEXT};display:flex;justify-content:space-between;">
    <span>${esc(identity)}</span>
    <span>${esc(model.meta.pageLabel)} <span class="pageNumber"></span></span>
  </div>`;
}
const workHoursReport = {
  id: "work-hours",
  labelKey: "reporting.templateWorkHours",
  build: buildWorkReport,
  html: sheetHtml,
  css: SHEET_CSS,
  marginPt: PAGE_MARGIN_PT,
  footer: footerTemplate
};
const ERRORS = {
  report_person_required: "Enter a name.",
  report_company_required: "Enter a company.",
  report_invalid_range: "The start date is after the end date.",
  report_empty: "No worked hours in that range."
};
function monthRange() {
  const now = /* @__PURE__ */ new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))),
    to: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)))
  };
}
function reportDefaults(db) {
  return {
    ...monthRange(),
    person: (db && getSetting(db, "report_person_name")) ?? "",
    company: (db && getSetting(db, "report_company_name")) ?? "",
    type: "hours",
    language: "fi"
  };
}
function buildModel(db, p) {
  return buildWorkReport({
    personName: p.person,
    companyName: p.company,
    startDate: p.from,
    endDate: p.to,
    language: p.language,
    type: p.type,
    days: getDaysInRange(db, p.from, p.to),
    entries: getEntriesInRange(db, p.from, p.to),
    leaveRanges: getLeaveRangesInRange(db, p.from, p.to)
  });
}
async function renderPdf(model) {
  const html = reportDocument(workHoursReport, model);
  const win2 = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true } });
  try {
    await win2.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const margin = workHoursReport.marginPt / 72;
    return await win2.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: workHoursReport.footer?.(model) ?? "<span></span>",
      margins: { top: margin, bottom: margin, left: margin, right: margin }
    });
  } finally {
    win2.destroy();
  }
}
function registerReportIpc(dataDir) {
  ipcMain.handle("report-defaults", () => reportDefaults(openCurrent(dataDir)));
  ipcMain.handle("report-pdf", async (_e, params) => {
    const db = openCurrent(dataDir);
    if (!db) {
      return { ok: false, error: "No data synced yet." };
    }
    let model;
    try {
      model = buildModel(db, params);
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      return { ok: false, error: ERRORS[code] ?? "Could not build the report." };
    }
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: join(app.getPath("documents"), `kelomit-report-${params.from}-${params.to}.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (canceled || !filePath) {
      return { ok: false, cancelled: true };
    }
    try {
      writeFileSync(filePath, await renderPdf(model));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    shell.openPath(filePath).catch(() => {
    });
    return { ok: true, path: filePath };
  });
}
function num$1(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function leadingNumber(s) {
  if (!s) {
    return null;
  }
  const m = /^\s*([\d.,]+)/.exec(s);
  if (!m) {
    return null;
  }
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function offToProduct(json, barcode) {
  const root = json;
  if (!root || root.status !== 1) {
    return null;
  }
  const p = root.product;
  if (!p) {
    return null;
  }
  const name = str(p.product_name_fi) ?? str(p.product_name);
  if (!name) {
    return null;
  }
  const n = p.nutriments ?? {};
  const kj = num$1(n["energy-kj_100g"]);
  const kcal100 = num$1(n["energy-kcal_100g"]) ?? (kj != null ? Math.round(kj / 4.184 * 10) / 10 : null);
  const servingLabel = str(p.serving_size);
  return {
    barcode,
    name,
    brand: str(p.brands),
    kcal_per_100: kcal100,
    kcal_per_serving: num$1(n["energy-kcal_serving"]),
    protein_per_100: num$1(n.proteins_100g),
    carbs_per_100: num$1(n.carbohydrates_100g),
    fat_per_100: num$1(n.fat_100g),
    serving_g: num$1(p.serving_quantity) ?? leadingNumber(servingLabel),
    serving_label: servingLabel,
    source: "off",
    source_ref: str(p.code) ?? barcode,
    image_url: str(p.image_front_small_url)
  };
}
const BASE = "https://world.openfoodfacts.org/api/v2/product/";
const FIELDS = "code,product_name,product_name_fi,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url";
async function lookupBarcode(barcode) {
  const res = await fetch(`${BASE}${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
    headers: { "User-Agent": `Kelomit Companion/${app.getVersion()} (tommi@pico.fi)`, Accept: "application/json" },
    signal: AbortSignal.timeout(8e3)
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Open Food Facts HTTP ${res.status}`);
  }
  return offToProduct(await res.json(), barcode);
}
function registerOffIpc() {
  ipcMain.handle("off-lookup", (_e, barcode) => lookupBarcode(String(barcode).trim()));
}
const KIND = { jpg: "photo", jpeg: "photo", png: "photo", mp4: "video", m4a: "voice", wav: "voice" };
const MEDIA_EXTENSIONS = Object.keys(KIND);
function stageFiles(dataDir, paths) {
  const out = { staged: [], skipped: [] };
  for (const p of paths) {
    let ext = extname(p).slice(1).toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    const media_type = KIND[ext];
    if (!media_type) {
      out.skipped.push(p.split("/").pop() ?? p);
      continue;
    }
    const name = `${media_type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    copyFileSync(p, mediaPath(dataDir, name));
    out.staged.push({ name, media_type });
  }
  return out;
}
function registerMediaIpc(dataDir, getWindow) {
  ipcMain.handle("media-stage", (_e, paths) => stageFiles(dataDir, paths));
  ipcMain.handle("media-pick", async () => {
    const win2 = getWindow();
    const opts = {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Photos, videos, audio", extensions: MEDIA_EXTENSIONS }]
    };
    const r = await (win2 ? dialog.showOpenDialog(win2, opts) : dialog.showOpenDialog(opts));
    return r.canceled ? { staged: [], skipped: [] } : stageFiles(dataDir, r.filePaths);
  });
}
async function reportCheck(dataDir, out, from, to) {
  const db = openCurrent(dataDir);
  if (!db) throw new Error("no current.db");
  const model = buildModel(db, { ...reportDefaults(db), from, to, person: "Test Person", company: "Test Oy" });
  writeFileSync(out, await renderPdf(model));
  app.quit();
}
const PORT = Number(process.env.KELOMIT_PORT) || 8090;
function ensureDataDir(userData) {
  mkdirSync(join(userData, "media"), { recursive: true });
  mkdirSync(join(userData, "snapshots"), { recursive: true });
  return userData;
}
function loadOrCreateToken(dataDir) {
  const path = join(dataDir, "token");
  if (existsSync(path)) {
    return readFileSync(path, "utf8").trim();
  }
  const token = randomBytes(24).toString("base64url");
  writeFileSync(path, token, { mode: 384 });
  return token;
}
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
function pairInfo(token) {
  const ip = lanAddress();
  const url = ip ? `http://${ip}:${PORT}` : null;
  const payload = url ? `kelomit://pair?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}` : null;
  return { url, token, payload };
}
function bearerAuth(token) {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    if (header !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
const SNAPSHOT_KEEP = 30;
function stamp(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function validate(path) {
  let db;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get();
    if (!row || row.v == null) {
      throw new Error("no schema version");
    }
  } catch (e) {
    throw new Error(`invalid database: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    db?.close();
  }
}
function pruneSnapshots(dataDir, keep = SNAPSHOT_KEEP) {
  const dir = join(dataDir, "snapshots");
  if (!existsSync(dir)) {
    return;
  }
  const names = readdirSync(dir).filter((n) => /^kelomit-\d{8}-\d{6}\.db$/.test(n)).sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    rmSync(join(dir, name), { force: true });
  }
}
async function ingestDatabase(body, paths) {
  const { dataDir } = paths;
  mkdirSync(join(dataDir, "snapshots"), { recursive: true });
  const incoming = join(dataDir, "incoming.db");
  writeFileSync(incoming, body);
  try {
    validate(incoming);
  } catch (e) {
    rmSync(incoming, { force: true });
    throw e;
  }
  copyFileSync(incoming, join(dataDir, "snapshots", `kelomit-${stamp()}.db`));
  renameSync(incoming, join(dataDir, "current.db"));
  pruneSnapshots(dataDir);
}
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", m4a: "audio/mp4", wav: "audio/wav" };
const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const MAX_DB_BYTES = 128 * 1024 * 1024;
function rejectIfOversized(c, maxBytes) {
  const header = c.req.header("Content-Length");
  const length = header ? Number(header) : NaN;
  if (!Number.isFinite(length) || length > maxBytes) {
    return c.json({ error: "payload too large" }, 413);
  }
  return null;
}
function apiRoutes(opts) {
  const app2 = new Hono();
  app2.use("/api/*", bearerAuth(opts.token));
  app2.get("/api/media/manifest", (c) => c.json({ files: listMedia(opts.dataDir) }));
  app2.get("/api/media/:filename", async (c) => {
    const name = c.req.param("filename");
    if (!isSafeMediaName(name)) {
      return c.json({ error: "bad filename" }, 400);
    }
    const path = mediaPath(opts.dataDir, name);
    if (!existsSync(path)) {
      return c.json({ error: "not found" }, 404);
    }
    const ext = name.split(".").pop().toLowerCase();
    return c.body(await readFile(path), 200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  });
  app2.post("/api/media/:filename", async (c) => {
    const oversized = rejectIfOversized(c, MAX_MEDIA_BYTES);
    if (oversized) return oversized;
    const name = c.req.param("filename");
    if (!isSafeMediaName(name)) {
      return c.json({ error: "bad filename" }, 400);
    }
    const body = Buffer.from(await c.req.arrayBuffer());
    saveMedia(opts.dataDir, name, body);
    return c.json({ ok: true });
  });
  app2.post("/api/sync", async (c) => {
    const oversized = rejectIfOversized(c, MAX_DB_BYTES);
    if (oversized) return oversized;
    const body = Buffer.from(await c.req.arrayBuffer());
    try {
      await ingestDatabase(body, { dataDir: opts.dataDir });
    } catch (e) {
      console.error("sync ingest failed:", e);
      return c.json({ error: "invalid database upload" }, 400);
    }
    return c.json({ ok: true });
  });
  return app2;
}
function startApiServer(dataDir, token) {
  const app2 = apiRoutes({ dataDir, token });
  app2.get("/healthz", (c) => c.text("ok"));
  const server = serve({ fetch: app2.fetch, port: PORT, hostname: "0.0.0.0" });
  console.log(`kelomit companion api on :${PORT}, data=${dataDir}`);
  return server;
}
function installMenu(getWindow) {
  const send = (action) => () => getWindow()?.webContents.send("menu", action);
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Pair phone…", accelerator: "CmdOrCtrl+Shift+P", click: send("pair") },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "File",
      submenu: [
        { label: "New Note", accelerator: "CmdOrCtrl+N", click: send("new-note") },
        { type: "separator" },
        { label: "Export Work Report…", accelerator: "CmdOrCtrl+E", click: send("export-report") },
        { type: "separator" },
        { role: "close" }
      ]
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Home", accelerator: "CmdOrCtrl+0", click: send("view-home") },
        { label: "Day", accelerator: "CmdOrCtrl+1", click: send("view-day") },
        { label: "Map", accelerator: "CmdOrCtrl+M", click: send("view-map") },
        { label: "Projects & Tags", accelerator: "CmdOrCtrl+2", click: send("view-projects") },
        { label: "Leave", accelerator: "CmdOrCtrl+3", click: send("view-leave") },
        { label: "Food", accelerator: "CmdOrCtrl+8", click: send("view-food") },
        { label: "Health", accelerator: "CmdOrCtrl+9", click: send("view-health") },
        { label: "Habits", accelerator: "CmdOrCtrl+4", click: send("view-habits") },
        { label: "Nags", accelerator: "CmdOrCtrl+5", click: send("view-nags") },
        { label: "Gallery", accelerator: "CmdOrCtrl+6", click: send("view-gallery") },
        { label: "Insights", accelerator: "CmdOrCtrl+7", click: send("view-insights") },
        { label: "Search", accelerator: "CmdOrCtrl+F", click: send("view-search") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Go",
      submenu: [
        { label: "Today", accelerator: "CmdOrCtrl+T", click: send("today") },
        { label: "Previous Day", accelerator: "CmdOrCtrl+[", click: send("prev-day") },
        { label: "Next Day", accelerator: "CmdOrCtrl+]", click: send("next-day") }
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Open Data Folder",
          click: () => {
            shell.openPath(app.getPath("userData"));
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
const unitLabels = { "DL": ["desilitra", "decilitre"], "RKL": ["ruokalusikka", "tablespoon"], "TL": ["teelusikka", "teaspoon"], "KPL_S": ["pieni (kpl)", "small piece"], "KPL_M": ["keskikokoinen (kpl)", "medium-sized piece"], "KPL_L": ["iso (kpl)", "big piece"], "KPL_VALM": ["Valmistaja (kpl)", "Manufacturer (piece)"], "PORTS": ["pieni annos", "small portion"], "PORTM": ["keskikokoinen annos", "medium-sized portion"], "PORTL": ["iso annos", "big portion"] };
const fineliJson = {
  unitLabels
};
function entryMatchesHabit(entry, matchers, entryTriggerIds) {
  return matchers.some((m) => {
    switch (m.kind) {
      case "project":
        return entry.project_id === m.ref_id;
      case "tag":
        return entry.tags?.some((t) => t.id === m.ref_id) ?? false;
      case "trigger":
        return entryTriggerIds.get(entry.id)?.includes(m.ref_id) ?? false;
      default:
        return false;
    }
  });
}
function dayMatchesLife(matchers, ctx) {
  return matchers.some((m) => {
    switch (m.kind) {
      case "steps":
        return ctx.health?.steps != null && ctx.health.steps >= (m.threshold ?? 1);
      case "sleep_minutes":
        return ctx.health?.sleep_minutes != null && ctx.health.sleep_minutes >= (m.threshold ?? 1);
      case "food_entries":
        return (ctx.food?.entries ?? 0) >= (m.threshold ?? 1);
      case "food_kcal":
        return m.threshold != null && (ctx.food?.entries ?? 0) > 0 && (ctx.food?.kcal ?? 0) <= m.threshold;
      default:
        return false;
    }
  });
}
function habitDayProgress(habit, matchers, dayEntries, entryTriggerIds, ctx = {}) {
  const hits = dayEntries.filter((e) => entryMatchesHabit(e, matchers, entryTriggerIds));
  const count = hits.length + (dayMatchesLife(matchers, ctx) ? 1 : 0);
  const seconds = hits.reduce((sum, e) => sum + entryTrackedSeconds(e), 0);
  const goal = habit.goal_value ?? 0;
  const done = habit.goal_kind === "count" ? count >= goal : habit.goal_kind === "minutes" ? seconds >= goal * 60 : count > 0;
  return { done, seconds, count };
}
function categoryStreak(habitsDoneByDate, today) {
  let d = /* @__PURE__ */ new Date(`${today}T00:00:00`);
  if (!habitsDoneByDate.get(today)) {
    d.setDate(d.getDate() - 1);
  }
  let n = 0;
  for (; ; ) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!habitsDoneByDate.get(key)) {
      return n;
    }
    n++;
    d.setDate(d.getDate() - 1);
  }
}
const FINELI_UNIT_LABELS = fineliJson.unitLabels;
const STREAK_WINDOW_DAYS = 120;
function localToday() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDate(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthBounds$1(month) {
  const [y, m] = month.split("-").map(Number);
  return [`${month}-01`, `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`];
}
function product(row) {
  return { ...row, archived: Boolean(row.archived) };
}
function dayFood(db, date) {
  if (!hasTable(db, "food_entries")) {
    return { entries: [], products: {}, kcal: 0, noKcal: 0 };
  }
  const entries = db.prepare(
    `SELECT f.* FROM food_entries f JOIN days d ON d.id = f.day_id
        WHERE d.date = ? ORDER BY f.eaten_at, f.id`
  ).all(date);
  const ids = [...new Set(entries.map((e) => e.product_id).filter((id) => id != null))];
  const products = {};
  if (ids.length > 0) {
    const rows = db.prepare(`SELECT * FROM food_products WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
    for (const r of rows) products[r.id] = product(r);
  }
  return {
    entries,
    products,
    kcal: entries.reduce((s, e) => s + (e.kcal ?? 0), 0),
    noKcal: entries.filter((e) => e.kcal == null).length
  };
}
function fineliUnits(db, foodId) {
  return db.prepare("SELECT code, grams FROM fineli_units WHERE food_id = ? ORDER BY rowid").all(foodId);
}
function foodSearch(db, query, lang = "fi") {
  const q = query.trim();
  const empty = { products: [], fineli: [], unitLabels: FINELI_UNIT_LABELS };
  if (!q || !hasTable(db, "food_products")) return empty;
  const products = db.prepare(
    `SELECT * FROM food_products
          WHERE archived = 0 AND (name LIKE ? OR brand LIKE ?)
          ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name LIMIT 6`
  ).all(`%${q}%`, `%${q}%`, `${q}%`).map(product);
  const own = new Set(products.filter((p) => p.source === "fineli").map((p) => p.source_ref));
  const col = lang === "fi" ? "name_fi" : "name_en";
  const fineli = hasTable(db, "fineli_foods") ? db.prepare(
    `SELECT * FROM fineli_foods
              WHERE name_fi LIKE ? OR name_en LIKE ?
              ORDER BY CASE WHEN ${col} LIKE ? THEN 0 WHEN name_fi LIKE ? THEN 1 ELSE 2 END, length(${col}) LIMIT 8`
  ).all(`%${q}%`, `%${q}%`, `${q}%`, `${q}%`).filter((f) => !own.has(String(f.id))).map((f) => ({ ...f, units: fineliUnits(db, f.id) })) : [];
  return { products, fineli, unitLabels: FINELI_UNIT_LABELS };
}
function foodProduct(db, id) {
  const row = hasTable(db, "food_products") ? db.prepare("SELECT * FROM food_products WHERE id = ?").get(id) : void 0;
  const p = row ? product(row) : null;
  const units = p?.source === "fineli" && p.source_ref && hasTable(db, "fineli_units") ? fineliUnits(db, Number(p.source_ref)) : [];
  return { product: p, units, unitLabels: FINELI_UNIT_LABELS };
}
function habitStates(db, from, to) {
  const empty = { categories: [], habits: [], matchers: [], triggers: [], overrides: {}, auto: {} };
  if (!hasTable(db, "habits")) return empty;
  const categories = db.prepare("SELECT * FROM habit_categories ORDER BY archived, id").all().map((r) => ({
    ...r,
    archived: Boolean(r.archived)
  }));
  const habits = db.prepare("SELECT * FROM habits ORDER BY archived, id").all().map((r) => ({
    ...r,
    archived: Boolean(r.archived)
  }));
  const matchers = db.prepare("SELECT habit_id, kind, ref_id, threshold FROM habit_matchers").all();
  const triggers = hasTable(db, "triggers") ? db.prepare("SELECT * FROM triggers ORDER BY name").all() : [];
  const overrides = {};
  for (const r of db.prepare("SELECT habit_id, date, done FROM habit_day_overrides WHERE date BETWEEN ? AND ?").all(from, to)) {
    (overrides[r.habit_id] ??= {})[r.date] = Boolean(r.done);
  }
  const byHabit = /* @__PURE__ */ new Map();
  for (const m of matchers) byHabit.set(m.habit_id, [...byHabit.get(m.habit_id) ?? [], m]);
  const active = habits.filter((h) => (byHabit.get(h.id)?.length ?? 0) > 0);
  const auto = {};
  if (active.length > 0) {
    const days = getDaysInRange(db, from, to);
    const entries = getEntriesInRange(db, from, to);
    const entriesByDay = /* @__PURE__ */ new Map();
    for (const e of entries) entriesByDay.set(e.day_id, [...entriesByDay.get(e.day_id) ?? [], e]);
    const triggerIds = /* @__PURE__ */ new Map();
    if (hasTable(db, "entry_triggers")) {
      for (const r of db.prepare(
        `SELECT et.entry_id, et.trigger_id FROM entry_triggers et
             JOIN entries e ON e.id = et.entry_id JOIN days d ON d.id = e.day_id
            WHERE d.date BETWEEN ? AND ?`
      ).all(from, to)) {
        triggerIds.set(r.entry_id, [...triggerIds.get(r.entry_id) ?? [], r.trigger_id]);
      }
    }
    const health = /* @__PURE__ */ new Map();
    if (hasTable(db, "health_daily")) {
      for (const r of db.prepare("SELECT date, steps, sleep_minutes FROM health_daily WHERE date BETWEEN ? AND ?").all(from, to)) {
        health.set(r.date, r);
      }
    }
    const food = /* @__PURE__ */ new Map();
    if (hasTable(db, "food_entries")) {
      for (const r of db.prepare(
        `SELECT d.date AS date, COALESCE(SUM(f.kcal), 0) AS kcal, COUNT(*) AS entries
             FROM food_entries f JOIN days d ON d.id = f.day_id
            WHERE d.date BETWEEN ? AND ? GROUP BY d.date`
      ).all(from, to)) {
        food.set(r.date, r);
      }
    }
    const dayByDate = new Map(days.map((d) => [d.date, d]));
    const dates = /* @__PURE__ */ new Set([...dayByDate.keys(), ...health.keys(), ...food.keys()]);
    for (const h of active) {
      const inner = {};
      for (const date of dates) {
        const day = dayByDate.get(date);
        const ctx = { health: health.get(date) ?? null, food: food.get(date) ?? null };
        const p = habitDayProgress(h, byHabit.get(h.id), day ? entriesByDay.get(day.id) ?? [] : [], triggerIds, ctx);
        if (p.count > 0) inner[date] = p;
      }
      auto[h.id] = inner;
    }
  }
  return { categories, habits, matchers, triggers, overrides, auto };
}
function habitDone(s, habitId, date) {
  return s.overrides[habitId]?.[date] ?? s.auto[habitId]?.[date]?.done ?? false;
}
function habitsMonth(db, month) {
  const today = localToday();
  const [mFrom, mTo] = monthBounds$1(month);
  const back = shiftDate(today, -STREAK_WINDOW_DAYS);
  const states = habitStates(db, mFrom < back ? mFrom : back, mTo > today ? mTo : today);
  const streaks = {};
  for (const c of states.categories) {
    const ids = states.habits.filter((h) => h.category_id === c.id && !h.archived).map((h) => h.id);
    const byDate = /* @__PURE__ */ new Map();
    for (let i = 0; i <= STREAK_WINDOW_DAYS; i++) {
      const d = shiftDate(today, -i);
      if (ids.some((id) => habitDone(states, id, d))) byDate.set(d, true);
    }
    streaks[c.id] = categoryStreak(byDate, today);
  }
  return { month, ...states, streaks, today };
}
function listNags(db) {
  if (!hasTable(db, "nags")) return { nags: [], done: {} };
  const nags = db.prepare("SELECT * FROM nags ORDER BY active DESC, title COLLATE NOCASE").all().map((r) => ({
    ...r,
    schedule: JSON.parse(r.schedule),
    plan: JSON.parse(r.plan),
    countdown: Boolean(r.countdown),
    active: Boolean(r.active)
  }));
  const done = {};
  for (const r of db.prepare("SELECT nag_id, due_at, done_at FROM nag_done").all()) {
    done[`${r.nag_id}|${r.due_at}`] = r.done_at;
  }
  return { nags, done };
}
function listPlaces(db) {
  const stops = hasTable(db, "day_route_stops");
  const named = hasTable(db, "named_places") ? db.prepare(
    `SELECT p.*, ${stops ? "(SELECT COUNT(*) FROM day_route_stops s WHERE s.named_place_id = p.id)" : "0"} AS uses
             FROM named_places p ORDER BY p.name COLLATE NOCASE`
  ).all() : [];
  const saved = hasTable(db, "locations") ? db.prepare(
    `SELECT l.*, ${stops ? "(SELECT COUNT(*) FROM day_route_stops s WHERE s.saved_location_id = l.id)" : "0"} AS uses
             FROM locations l ORDER BY l.created_at`
  ).all() : [];
  return { named, saved };
}
function healthRow(row) {
  let exercise = null;
  if (typeof row.exercise === "string") {
    try {
      exercise = JSON.parse(row.exercise);
    } catch {
      exercise = null;
    }
  }
  return { ...row, exercise };
}
function dayHealth(db, date) {
  if (!hasTable(db, "health_daily")) return null;
  const row = db.prepare("SELECT * FROM health_daily WHERE date = ?").get(date);
  return row ? healthRow(row) : null;
}
function healthMonth(db, month) {
  if (!hasTable(db, "health_daily")) return [];
  const [from, to] = monthBounds$1(month);
  return db.prepare("SELECT * FROM health_daily WHERE date BETWEEN ? AND ? ORDER BY date DESC").all(from, to).map(healthRow);
}
function foodMonth(db, month) {
  if (!hasTable(db, "food_entries")) return { days: [], kcal: 0 };
  const [from, to] = monthBounds$1(month);
  const rows = db.prepare(
    `SELECT f.*, d.date AS date FROM food_entries f JOIN days d ON d.id = f.day_id
        WHERE d.date BETWEEN ? AND ? ORDER BY d.date DESC, f.eaten_at, f.id`
  ).all(from, to);
  const days = [];
  for (const r of rows) {
    let day = days.at(-1);
    if (!day || day.date !== r.date) {
      day = { date: r.date, kcal: 0, noKcal: 0, entries: [] };
      days.push(day);
    }
    day.entries.push(r);
    if (r.kcal == null) day.noKcal++;
    else day.kcal += r.kcal;
  }
  return { days, kcal: days.reduce((s, d) => s + d.kcal, 0) };
}
function gallery(db, month) {
  if (!hasTable(db, "entry_media")) return [];
  const [from, to] = monthBounds$1(month);
  return db.prepare(
    `SELECT em.entry_id, em.media_type, em.file_path, em.thumbnail_path, d.date, e.created_at, e.title
         FROM entry_media em
         JOIN entries e ON e.id = em.entry_id
         JOIN days d ON d.id = e.day_id
        WHERE em.media_type IN ('photo', 'video') AND d.date BETWEEN ? AND ?
        ORDER BY d.date DESC, e.created_at DESC, em.position`
  ).all(from, to);
}
function search(db, query, limit = 60) {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT DISTINCT e.id, d.date
         FROM entries e
         JOIN days d ON d.id = e.day_id
         LEFT JOIN projects p ON p.id = e.project_id
         LEFT JOIN entry_tags et ON et.entry_id = e.id
         LEFT JOIN tags t ON t.id = et.tag_id
        WHERE e.title LIKE ? OR e.body LIKE ? OR p.name LIKE ? OR t.name LIKE ?
        ORDER BY d.date DESC, e.created_at DESC
        LIMIT ?`
  ).all(like, like, like, like, limit);
  if (rows.length === 0) return [];
  const byId = new Map(
    loadEntries(
      db,
      `e.id IN (${rows.map(() => "?").join(",")})`,
      rows.map((r) => r.id)
    ).map((e) => [e.id, e])
  );
  return rows.flatMap((r) => {
    const entry = byId.get(r.id);
    return entry ? [{ entry, date: r.date }] : [];
  });
}
function aggregateModeDurations(spans) {
  const totals = {};
  for (const span of spans) {
    const seconds = (Date.parse(span.endTs) - Date.parse(span.startTs)) / 1e3;
    totals[span.mode] = (totals[span.mode] ?? 0) + seconds;
  }
  return totals;
}
function sliceByModeSpans(coordinates, spans) {
  if (coordinates.length < 2 || !spans || spans.length === 0 || coordinates.some((coordinate) => coordinate.t == null)) {
    return [{ mode: "unknown", coordinates }];
  }
  const parsed = spans.map((span) => ({
    mode: span.mode,
    startMs: Date.parse(span.startTs),
    endMs: Date.parse(span.endTs)
  }));
  const modeAt = (ms) => {
    for (const span of parsed) {
      if (ms >= span.startMs && ms < span.endMs) {
        return span.mode;
      }
    }
    return "unknown";
  };
  const slices2 = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const point = coordinates[index];
    const mode = modeAt((previous.t + point.t) / 2);
    const current = slices2[slices2.length - 1];
    if (current && current.mode === mode) {
      current.coordinates.push(point);
    } else {
      slices2.push({ mode, coordinates: [previous, point] });
    }
  }
  return slices2;
}
const EARTH_RADIUS_M = 6371e3;
function toRad(deg) {
  return deg * Math.PI / 180;
}
function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
function emptyMovement() {
  return { footSec: 0, cycleSec: 0, vehicleSec: 0, stillSec: 0, footM: 0, cycleM: 0, vehicleM: 0 };
}
function sliceMeters(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += distanceMeters(coords[i - 1].latitude, coords[i - 1].longitude, coords[i].latitude, coords[i].longitude);
  }
  return m;
}
function summarizeSegments(segments) {
  const s = emptyMovement();
  for (const seg of segments) {
    const spans = seg.mode_spans;
    if (!spans || spans.length === 0) {
      continue;
    }
    const secs = aggregateModeDurations(spans);
    s.footSec += secs.foot ?? 0;
    s.cycleSec += secs.cycle ?? 0;
    s.vehicleSec += secs.vehicle ?? 0;
    s.stillSec += secs.still ?? seg.still_seconds ?? 0;
    for (const slice of sliceByModeSpans(seg.coordinates, spans)) {
      const m = sliceMeters(slice.coordinates);
      if (slice.mode === "foot") {
        s.footM += m;
      } else if (slice.mode === "cycle") {
        s.cycleM += m;
      } else if (slice.mode === "vehicle") {
        s.vehicleM += m;
      }
    }
  }
  return s;
}
function metFor(mode, kmh) {
  if (mode === "foot") {
    if (kmh < 3.2) {
      return 2.3;
    }
    if (kmh < 4.5) {
      return 2.8;
    }
    if (kmh < 5.6) {
      return 3.8;
    }
    if (kmh < 6.4) {
      return 4.8;
    }
    if (kmh < 8) {
      return 5.5;
    }
    return 8;
  }
  if (kmh < 16) {
    return 4;
  }
  if (kmh < 19) {
    return 6.8;
  }
  if (kmh < 22.5) {
    return 8;
  }
  return 10;
}
function movementKcal(m, weightKg) {
  let kcal = 0;
  const legs = [["foot", m.footSec, m.footM], ["cycle", m.cycleSec, m.cycleM]];
  for (const [mode, sec, meters] of legs) {
    if (sec <= 0) {
      continue;
    }
    const hours = sec / 3600;
    const kmh = meters / 1e3 / hours;
    kcal += metFor(mode, kmh) * weightKg * hours;
  }
  return Math.round(kcal / 50) * 50;
}
function missingProfileFields(p) {
  const out = [];
  if (p.weightKg == null) {
    out.push("weight");
  }
  if (p.heightCm == null) {
    out.push("height");
  }
  if (p.birthYear == null) {
    out.push("birthYear");
  }
  if (p.sex == null) {
    out.push("sex");
  }
  return out;
}
function bmrMifflin(p, year) {
  if (p.weightKg == null || p.heightCm == null || p.birthYear == null || p.sex == null) {
    return null;
  }
  const age = year - p.birthYear;
  return Math.round(10 * p.weightKg + 6.25 * p.heightCm - 5 * age + (p.sex === "male" ? 5 : -161));
}
const EXERCISE_MET = {
  2: 5.5,
  // badminton
  5: 6.5,
  // basketball
  8: 7,
  // biking
  9: 6.8,
  // biking, stationary
  10: 7,
  // boot camp
  11: 7.8,
  // boxing
  13: 3.8,
  // calisthenics
  16: 5,
  // dancing
  25: 5,
  // elliptical
  26: 5.5,
  // exercise class
  32: 4.8,
  // golf
  33: 1.3,
  // guided breathing
  36: 8,
  // HIIT
  37: 6,
  // hiking
  38: 8,
  // ice hockey
  39: 5.5,
  // ice skating
  41: 11,
  // jump rope
  44: 7.5,
  // martial arts
  46: 4,
  // paddling
  48: 3,
  // pilates
  51: 7.5,
  // rock climbing
  53: 5,
  // rowing
  54: 6,
  // rowing machine
  56: 9,
  // running
  57: 9,
  // running, treadmill
  60: 6,
  // skating
  61: 7,
  // skiing
  62: 5.3,
  // snowboarding
  63: 5.3,
  // snowshoeing
  64: 7,
  // soccer
  66: 7.3,
  // squash
  68: 6,
  // stair climbing
  69: 6,
  // stair machine
  70: 3.5,
  // strength training
  71: 2.3,
  // stretching
  73: 6,
  // swimming, open water
  74: 6,
  // swimming, pool
  75: 4,
  // table tennis
  76: 6.8,
  // tennis
  78: 4,
  // volleyball
  79: 3.5,
  // walking
  81: 3.5,
  // weightlifting
  83: 2.5
  // yoga
};
const DEFAULT_EXERCISE_MET = 5;
const FOOT_TYPES = /* @__PURE__ */ new Set([37, 56, 79]);
const CYCLE_TYPES = /* @__PURE__ */ new Set([8]);
function exerciseMet(type) {
  return EXERCISE_MET[type] ?? DEFAULT_EXERCISE_MET;
}
const PAR_SLEEP = 1;
const PAR_EXTRA_STEPS = 2.5;
const PAR_VEHICLE = 1.5;
const PAR_REST = 1.4;
const WORK_PAR = { desk: 1.5, mixed: 2.2, physical: 3.5 };
const ASSUMED_SLEEP_MIN = 480;
const STEP_M = 0.75;
const STEPS_PER_MIN = 100;
function gpsLeg(mode, sec, meters) {
  if (sec <= 0) {
    return { minutes: 0, metMinutes: 0 };
  }
  const minutes = sec / 60;
  return { minutes, metMinutes: metFor(mode, meters / 1e3 / (sec / 3600)) * minutes };
}
function sessionLeg(bouts, types) {
  let minutes = 0;
  let metMinutes = 0;
  for (const b of bouts) {
    if (!types.has(b.type)) {
      continue;
    }
    minutes += b.minutes;
    metMinutes += exerciseMet(b.type) * b.minutes;
  }
  return { minutes, metMinutes };
}
function larger(a, b) {
  return a.metMinutes >= b.metMinutes ? a : b;
}
function energyDay(input) {
  const perMin = input.bmr / 1440;
  let remaining = Math.max(0, Math.min(1440, input.minutesInDay));
  const buckets = [];
  const push = (key, minutes, par, assumed) => {
    const m2 = Math.max(0, Math.min(minutes, remaining));
    if (m2 <= 0) {
      return;
    }
    remaining -= m2;
    buckets.push({ key, minutes: Math.round(m2), par: Math.round(par * 10) / 10, kcal: Math.round(perMin * par * m2), ...assumed ? { assumed } : {} });
  };
  const m = input.movement;
  const hcFoot = sessionLeg(input.exercise, FOOT_TYPES);
  const gpsFoot = gpsLeg("foot", m.footSec, m.footM);
  const walk = larger(gpsFoot, hcFoot);
  const cycle = larger(gpsLeg("cycle", m.cycleSec, m.cycleM), sessionLeg(input.exercise, CYCLE_TYPES));
  const other = input.exercise.filter((b) => !FOOT_TYPES.has(b.type) && !CYCLE_TYPES.has(b.type));
  const otherMin = other.reduce((s, b) => s + b.minutes, 0);
  const otherMet = otherMin > 0 ? other.reduce((s, b) => s + exerciseMet(b.type) * b.minutes, 0) / otherMin : 0;
  const explained = walk === gpsFoot ? m.footM / STEP_M : walk.minutes * STEPS_PER_MIN;
  const extraSteps = Math.max(0, (input.steps ?? 0) - explained);
  if (input.sleepMinutes != null) {
    push("sleep", input.sleepMinutes, PAR_SLEEP);
  } else {
    push("sleep", ASSUMED_SLEEP_MIN, PAR_SLEEP, true);
  }
  push("exercise", otherMin, otherMet);
  push("walk", walk.minutes, walk.minutes > 0 ? walk.metMinutes / walk.minutes : 0);
  push("cycle", cycle.minutes, cycle.minutes > 0 ? cycle.metMinutes / cycle.minutes : 0);
  push("steps", extraSteps / STEPS_PER_MIN, PAR_EXTRA_STEPS);
  push("vehicle", m.vehicleSec / 60, PAR_VEHICLE);
  push("work", input.workMinutes, WORK_PAR[input.workActivity]);
  push("rest", remaining, PAR_REST);
  const kcal = buckets.reduce((s, b) => s + b.kcal, 0);
  const covered = buckets.reduce((s, b) => s + b.minutes, 0);
  return {
    buckets,
    totalKcal: Math.round(kcal / 10) * 10,
    pal: covered > 0 ? Math.round(kcal / (perMin * covered) * 100) / 100 : 0
  };
}
const PATTERN_PAIRS = [
  { x: "sleep", y: "kcal", lag: 0 },
  { x: "sleep", y: "work", lag: 0 },
  { x: "sleep", y: "habits", lag: 0 },
  { x: "steps", y: "sleep", lag: 1 },
  { x: "exercise", y: "sleep", lag: 1 },
  { x: "work", y: "kcal", lag: 0 },
  { x: "work", y: "habits", lag: 0 },
  { x: "work", y: "steps", lag: 0 }
];
const MIN_DAYS = 7;
const MIN_DIFF = 0.1;
function nextDate(date) {
  const d = /* @__PURE__ */ new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function comparePair(points, pair) {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const rows = [];
  for (const p of points) {
    const x = p[pair.x];
    const y = (pair.lag === 0 ? p : byDate.get(nextDate(p.date)))?.[pair.y];
    if (x != null && y != null) {
      rows.push({ x, y });
    }
  }
  if (rows.length < MIN_DAYS * 2) {
    return null;
  }
  const xs = rows.map((r) => r.x).sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  const threshold = xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  const inclusive = rows.filter((r) => r.x < threshold).length < MIN_DAYS;
  const isLow = (x) => inclusive ? x <= threshold : x < threshold;
  const low = rows.filter((r) => isLow(r.x)).map((r) => r.y);
  const high = rows.filter((r) => !isLow(r.x)).map((r) => r.y);
  if (low.length < MIN_DAYS || high.length < MIN_DAYS) {
    return null;
  }
  const lowMean = mean(low);
  const highMean = mean(high);
  const top = Math.max(Math.abs(lowMean), Math.abs(highMean));
  const strength = top > 0 ? Math.abs(highMean - lowMean) / top : 0;
  if (strength < MIN_DIFF) {
    return null;
  }
  return { ...pair, threshold, inclusive, lowMean, highMean, lowDays: low.length, highDays: high.length, strength };
}
function findPatterns(points, limit = 5) {
  return PATTERN_PAIRS.map((pair) => comparePair(points, pair)).filter((p) => p != null).sort((a, b) => b.strength - a.strength).slice(0, limit);
}
function usableDays(points) {
  const keys = ["sleep", "steps", "exercise", "kcal", "work", "habits"];
  return points.filter((p) => keys.filter((k) => p[k] != null).length >= 2).length;
}
const ENTRY_SECS_SQL = `CASE
    WHEN e.duration_sec IS NOT NULL THEN e.duration_sec
    WHEN e.time_from IS NOT NULL AND e.time_to IS NOT NULL
      THEN MAX(0, CAST(strftime('%s', e.time_to) AS INTEGER) - CAST(strftime('%s', e.time_from) AS INTEGER))
    ELSE 0
  END`;
const SCOPE_FILTER = {
  all: "",
  work: "AND e.activity_type = 'work'",
  personal: "AND e.activity_type IN ('personal', 'personal_work')"
};
function mondayOf(date) {
  const d = /* @__PURE__ */ new Date(`${date}T12:00:00`);
  return shiftDate(date, -((d.getDay() + 6) % 7));
}
function rangeFor(period, today = localToday()) {
  if (period === "week") return { start: mondayOf(today), end: today };
  if (period === "month") return { start: `${today.slice(0, 7)}-01`, end: today };
  return { start: shiftDate(today, -29), end: today };
}
function datesBetween$1(start, end) {
  const out = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) out.push(d);
  return out;
}
function slices(rows, label) {
  return rows.map((r) => ({ key: String(r.k), label: label(r), seconds: r.s ?? 0 })).filter((s) => s.seconds > 0).sort((a, b) => b.seconds - a.seconds);
}
function breakdown(db, start, end, scope) {
  const where = `WHERE d.date >= ? AND d.date <= ? AND (e.is_todo = 0 OR e.completed_at IS NOT NULL) ${SCOPE_FILTER[scope]}`;
  const byActivity = slices(
    db.prepare(
      `SELECT e.activity_type AS k, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s FROM entries e JOIN days d ON d.id = e.day_id ${where} GROUP BY e.activity_type`
    ).all(start, end),
    (r) => String(r.k)
  );
  const byProject = slices(
    db.prepare(
      `SELECT e.project_id AS k, p.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
           FROM entries e JOIN days d ON d.id = e.day_id LEFT JOIN projects p ON p.id = e.project_id ${where} GROUP BY e.project_id`
    ).all(start, end),
    (r) => r.name ?? "No project"
  );
  const byTag = slices(
    db.prepare(
      `SELECT t.id AS k, t.name AS name, CAST(SUM(${ENTRY_SECS_SQL}) AS INTEGER) AS s
           FROM entries e JOIN days d ON d.id = e.day_id JOIN entry_tags et ON et.entry_id = e.id JOIN tags t ON t.id = et.tag_id ${where} GROUP BY t.id`
    ).all(start, end),
    (r) => r.name ?? "—"
  );
  return { totalSeconds: byActivity.reduce((s, x) => s + x.seconds, 0), byActivity, byProject, byTag };
}
function workSecondsByDay(db, start, end) {
  const days = getDaysInRange(db, start, end);
  const byDayId = /* @__PURE__ */ new Map();
  for (const e of getEntriesInRange(db, start, end)) byDayId.set(e.day_id, [...byDayId.get(e.day_id) ?? [], e]);
  const out = {};
  for (const day of days) {
    const secs = calcDayWorkSecs(day, byDayId.get(day.id) ?? []);
    if (secs > 0) out[day.date] = secs;
  }
  return out;
}
function parse(json, fallback) {
  if (typeof json !== "string" || !json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
function segmentsByDay(db, start, end) {
  const out = /* @__PURE__ */ new Map();
  if (!hasTable(db, "day_route_segments")) return out;
  const rows = db.prepare(
    `SELECT d.date AS date, s.coordinates_json, s.mode_spans_json, s.still_seconds
         FROM day_route_segments s JOIN days d ON d.id = s.day_id
        WHERE d.date >= ? AND d.date <= ? ORDER BY d.date, s.sequence`
  ).all(start, end);
  for (const r of rows) {
    const seg = {
      coordinates: parse(r.coordinates_json, []),
      mode_spans: parse(r.mode_spans_json, null),
      still_seconds: r.still_seconds
    };
    out.set(r.date, [...out.get(r.date) ?? [], seg]);
  }
  return out;
}
function foodByDay(db, start, end) {
  const out = {};
  if (!hasTable(db, "food_entries")) return out;
  for (const r of db.prepare(
    `SELECT d.date AS date, COALESCE(SUM(f.kcal), 0) AS kcal, COUNT(*) AS entries, SUM(CASE WHEN f.kcal IS NULL THEN 1 ELSE 0 END) AS no_kcal
         FROM food_entries f JOIN days d ON d.id = f.day_id WHERE d.date >= ? AND d.date <= ? GROUP BY d.date`
  ).all(start, end)) {
    out[r.date] = { kcal: Number(r.kcal), entries: Number(r.entries), noKcal: Number(r.no_kcal) };
  }
  return out;
}
function healthRange(db, start, end) {
  if (!hasTable(db, "health_daily")) return [];
  return db.prepare("SELECT * FROM health_daily WHERE date >= ? AND date <= ? ORDER BY date").all(start, end).map((r) => ({ ...r, exercise: parse(r.exercise, null) }));
}
const avg = (vals) => vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
const num = (v) => v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
function insights(db, period, scope) {
  const today = localToday();
  const { start, end } = rangeFor(period, today);
  const dates = datesBetween$1(start, end);
  const now = /* @__PURE__ */ new Date();
  const work = { ...breakdown(db, start, end, scope), byDay: workSecondsByDay(db, start, end) };
  const segs = segmentsByDay(db, start, end);
  const movement = summarizeSegments([...segs.values()].flat());
  const footSecByDay = {};
  for (const [date, list] of segs) footSecByDay[date] = summarizeSegments(list).footSec;
  const hs = habitStates(db, start, end);
  const habits = hs.categories.map((cat) => {
    const ids = hs.habits.filter((h) => h.category_id === cat.id).map((h) => h.id);
    if (ids.length === 0) return null;
    return { id: cat.id, title: cat.title, done: dates.filter((d) => ids.some((id) => habitDone(hs, id, d))).length };
  }).filter((r) => r != null);
  const fbd = foodByDay(db, start, end);
  const fdays = Object.values(fbd);
  const food = {
    kcal: fdays.reduce((s, d) => s + d.kcal, 0),
    entries: fdays.reduce((s, d) => s + d.entries, 0),
    noKcal: fdays.reduce((s, d) => s + d.noKcal, 0),
    days: fdays.length,
    byDay: fbd
  };
  const hc = healthRange(db, start, end);
  const weights = hc.map((h) => h.weight_kg).filter((v) => v != null);
  const steps = avg(hc.map((h) => h.steps).filter((v) => v != null));
  const sleep = avg(hc.map((h) => h.sleep_minutes).filter((v) => v != null));
  const hr = avg(hc.map((h) => h.resting_hr).filter((v) => v != null));
  const health = {
    steps: steps != null ? Math.round(steps) : null,
    sleep: sleep != null ? Math.round(sleep) : null,
    hr: hr != null ? Math.round(hr) : null,
    weightFrom: weights[0] ?? null,
    weightTo: weights[weights.length - 1] ?? null,
    stepsByDay: Object.fromEntries(hc.filter((h) => h.steps != null).map((h) => [h.date, h.steps]))
  };
  const settingsWeight = num(getSetting(db, "body_weight_kg"));
  const profile = {
    weightKg: [...hc].reverse().find((h) => h.weight_kg != null)?.weight_kg ?? settingsWeight,
    heightCm: num(getSetting(db, "body_height_cm")),
    birthYear: num(getSetting(db, "birth_year")),
    sex: getSetting(db, "sex") || null
  };
  const wa = getSetting(db, "work_activity");
  const workActivity = wa === "mixed" || wa === "physical" ? wa : "desk";
  const bmr = bmrMifflin(profile, now.getFullYear());
  const hcByDate = new Map(hc.map((h) => [h.date, h]));
  const usedByDay = {};
  let used = 0;
  let eaten = 0;
  let eatenDays = 0;
  let finished = 0;
  if (bmr != null) {
    for (const date of dates) {
      const h = hcByDate.get(date);
      const list = segs.get(date);
      const e = energyDay({
        bmr,
        minutesInDay: date === today ? now.getHours() * 60 + now.getMinutes() : 1440,
        sleepMinutes: h?.sleep_minutes ?? null,
        exercise: h?.exercise ?? [],
        movement: list ? summarizeSegments(list) : emptyMovement(),
        steps: h?.steps ?? null,
        workMinutes: Math.round((work.byDay[date] ?? 0) / 60),
        workActivity
      });
      usedByDay[date] = e.totalKcal;
      if (date < today) {
        finished++;
        used += e.totalKcal;
        const f = fbd[date];
        if (f && f.entries > f.noKcal) {
          eaten += f.kcal;
          eatenDays++;
        }
      }
    }
  }
  const energy = {
    bmr,
    missing: missingProfileFields(profile),
    used,
    usedAvg: finished > 0 ? Math.round(used / finished / 10) * 10 : 0,
    eaten,
    eatenAvg: eatenDays > 0 ? Math.round(eaten / eatenDays / 10) * 10 : 0,
    eatenDays,
    days: finished,
    usedByDay
  };
  const pEnd = shiftDate(today, -1);
  const pStart = shiftDate(pEnd, -89);
  const pHealth = new Map(healthRange(db, pStart, pEnd).map((h) => [h.date, h]));
  const pFood = foodByDay(db, pStart, pEnd);
  const pWork = workSecondsByDay(db, pStart, pEnd);
  const phs = habitStates(db, pStart, pEnd);
  const habitIds = phs.habits.filter((h) => !h.archived).map((h) => h.id);
  const points = datesBetween$1(pStart, pEnd).map((date) => {
    const h = pHealth.get(date);
    const f = pFood[date];
    return {
      date,
      sleep: h?.sleep_minutes ?? null,
      steps: h?.steps ?? null,
      exercise: h?.exercise ? h.exercise.reduce((s, b) => s + b.minutes, 0) : null,
      // a day with any kcal-less entry would read as a light day — skip it
      kcal: f && f.noKcal === 0 ? f.kcal : null,
      work: pWork[date] ? pWork[date] / 3600 : null,
      ...habitIds.length > 0 ? { habits: habitIds.filter((id) => habitDone(phs, id, date)).length / habitIds.length * 100 } : {}
    };
  });
  return {
    period,
    scope,
    start,
    end,
    today,
    weeklyTargetHours: num(getSetting(db, "weekly_target_hours")) ?? 40,
    work,
    movement: {
      ...movement,
      kcal: profile.weightKg != null && (movement.footSec > 0 || movement.cycleSec > 0) ? movementKcal(movement, profile.weightKg) : null,
      footSecByDay
    },
    habits,
    food,
    health,
    energy,
    patterns: { days: usableDays(points), list: findPatterns(points) }
  };
}
function monthBounds(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, "0")}`];
}
function monthSummary(db, month) {
  const [from, to] = monthBounds(month);
  const days = getDaysInRange(db, from, to);
  const entries = getEntriesInRange(db, from, to);
  const leaves = getLeaveRangesInRange(db, from, to);
  const entriesByDay = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const list2 = entriesByDay.get(e.day_id);
    if (list2) list2.push(e);
    else entriesByDay.set(e.day_id, [e]);
  }
  const byDate = /* @__PURE__ */ new Map();
  for (const day of days) {
    const own = entriesByDay.get(day.id) ?? [];
    byDate.set(day.date, {
      date: day.date,
      workSeconds: calcDayWorkSecs(day, own),
      entryCount: own.length,
      hasLegs: Boolean(day.started_at && day.ended_at) || Boolean(day.started_at_2 && day.ended_at_2),
      leaves: []
    });
  }
  for (const leave of leaves) {
    for (const date of datesBetween(leave.start_date, leave.end_date, from, to)) {
      const md = byDate.get(date) ?? { date, workSeconds: 0, entryCount: 0, hasLegs: false, leaves: [] };
      md.leaves.push(leave);
      byDate.set(date, md);
    }
  }
  const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    month,
    days: list,
    totalWorkSeconds: list.reduce((s, d) => s + d.workSeconds, 0)
  };
}
function datesBetween(start, end, clampFrom, clampTo) {
  const out = [];
  const s = start < clampFrom ? clampFrom : start;
  const e = end > clampTo ? clampTo : end;
  const d = /* @__PURE__ */ new Date(`${s}T00:00:00Z`);
  const stop = /* @__PURE__ */ new Date(`${e}T00:00:00Z`);
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function dayDetail(db, date) {
  const day = getDay(db, date);
  const leaves = getLeaveRangesInRange(db, date, date);
  if (!day || day.id < 0) {
    return { day, entries: [], media: [], leaves, segments: [], stops: [] };
  }
  return {
    day,
    entries: getEntries(db, day.id),
    media: getEntryMedia(db, day.id),
    leaves,
    segments: getRouteSegments(db, day.id),
    stops: getRouteStops(db, day.id)
  };
}
function listProjects(db) {
  return db.prepare("SELECT * FROM projects ORDER BY archived, name COLLATE NOCASE").all().map((p) => ({
    ...p,
    archived: Boolean(p.archived)
  }));
}
function dayRoute(db, date) {
  const day = getDay(db, date);
  if (!day || day.id < 0) {
    return { trips: [], stops: [] };
  }
  const rows = db.prepare(
    `SELECT sequence, start_ts, end_ts, coordinates_json, mode_spans_json, distance_m, duration_sec
         FROM day_route_segments WHERE day_id = ? ORDER BY sequence`
  ).all(day.id);
  const parse2 = (json, fallback) => {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  };
  return {
    trips: rows.map((r) => ({
      sequence: r.sequence,
      start_ts: r.start_ts,
      end_ts: r.end_ts,
      coordinates: parse2(r.coordinates_json, []),
      mode_spans: parse2(r.mode_spans_json, null),
      distance_m: r.distance_m,
      duration_sec: r.duration_sec
    })),
    stops: db.prepare("SELECT * FROM day_route_stops WHERE day_id = ? ORDER BY start_ts").all(day.id).map((s) => ({
      ...s,
      user_edited: Boolean(s.user_edited)
    }))
  };
}
function listLeave(db, year) {
  return getLeaveRangesInRange(db, `${year}-01-01`, `${year}-12-31`);
}
function listTags(db) {
  return db.prepare("SELECT * FROM tags ORDER BY name COLLATE NOCASE").all();
}
const QUERIES = {
  monthSummary,
  dayDetail,
  listProjects,
  listTags,
  listLeave,
  dayRoute,
  dayFood,
  foodSearch,
  foodProduct,
  habitsMonth,
  listNags,
  listPlaces,
  dayHealth,
  foodMonth,
  healthMonth,
  gallery,
  search,
  insights
};
function registerQueryIpc(dataDir) {
  ipcMain.handle("query", (_e, name, ...args) => {
    if (!Object.prototype.hasOwnProperty.call(QUERIES, name)) {
      throw new Error(`unknown query: ${name}`);
    }
    const db = openCurrent(dataDir);
    if (!db) {
      return null;
    }
    const fn = QUERIES[name];
    return fn(db, ...args);
  });
}
function watchCurrentDb(dataDir, onChange, settleMs = 150) {
  let timer = null;
  return watch(dataDir, (_event, filename) => {
    if (filename !== "current.db") {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, settleMs);
  });
}
class PhoneOfflineError extends Error {
  constructor() {
    super("phone offline");
  }
}
const ACK_TIMEOUT_MS = 2e4;
class PhoneLink extends EventEmitter {
  constructor(server, token) {
    super();
    this.token = token;
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket, req) => {
      if (req.headers.authorization !== `Bearer ${this.token}`) {
        socket.close(4401, "unauthorized");
        return;
      }
      this.socket?.close(4e3, "replaced");
      this.socket = socket;
      this.update({ connected: true, lastSeenAt: (/* @__PURE__ */ new Date()).toISOString() });
      socket.on("message", (data) => this.onMessage(String(data)));
      socket.on("close", () => {
        if (this.socket === socket) {
          this.socket = null;
          this.update({ connected: false, activeSession: null });
          this.failPending("phone disconnected");
        }
      });
      socket.on("error", () => {
      });
    });
  }
  token;
  socket = null;
  pending = /* @__PURE__ */ new Map();
  state = { connected: false, lastSeenAt: null, appVersion: null, activeSession: null };
  update(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }
  onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const patch = { lastSeenAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (msg.type === "hello") {
      patch.appVersion = typeof msg.app_version === "string" ? msg.app_version : null;
    } else if (msg.type === "status") {
      patch.activeSession = msg.active_session ?? null;
    } else if (msg.type === "ack" && typeof msg.id === "string") {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.pending.delete(msg.id);
        waiter.resolve({
          id: msg.id,
          ok: Boolean(msg.ok),
          result: msg.result,
          error: typeof msg.error === "string" ? msg.error : void 0
        });
      }
    }
    this.update(patch);
  }
  failPending(error) {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id, ok: false, error });
    }
    this.pending.clear();
  }
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  /** Send one command and wait for its ack. Rejects with PhoneOfflineError
   *  when no phone is connected — the queue decides what to do then. */
  send(fn, args, id = randomUUID()) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new PhoneOfflineError());
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ id, ok: false, error: "ack timeout" });
      }, ACK_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      socket.send(JSON.stringify({ type: "cmd", id, fn, args }));
    });
  }
}
const RETRY_AFTER_TIMEOUT_MS = 5e3;
class CommandQueue extends EventEmitter {
  constructor(file, sender) {
    super();
    this.file = file;
    this.sender = sender;
    if (existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, "utf8"));
        this.items = saved.items ?? [];
        this.failed = saved.failed ?? [];
      } catch {
      }
    }
  }
  file;
  sender;
  items = [];
  failed = [];
  sending = null;
  retryTimer = null;
  snapshot() {
    return { items: [...this.items], failed: [...this.failed], sending: this.sending };
  }
  persist() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ items: this.items, failed: this.failed }, null, 1));
    renameSync(tmp, this.file);
    this.emit("change", this.snapshot());
  }
  /** Enqueue and start draining. Returns the item id. */
  push(fn, args, label) {
    const item = { id: randomUUID(), fn, args, label, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.items.push(item);
    this.persist();
    this.drain();
    return item.id;
  }
  /** Replace a not-yet-sent item's args (editing a pending create). */
  update(id, args, label) {
    const item = this.items.find((i) => i.id === id);
    if (!item || this.sending === id) {
      return false;
    }
    item.args = args;
    if (label) item.label = label;
    this.persist();
    return true;
  }
  /** Drop a not-yet-sent item (deleting a pending create). */
  remove(id) {
    if (this.sending === id) {
      return false;
    }
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length === before) {
      return false;
    }
    this.persist();
    return true;
  }
  dismissFailed(id) {
    this.failed = this.failed.filter((f) => f.item.id !== id);
    this.persist();
  }
  /** Send items in order until the queue is empty or the phone is gone. */
  drain() {
    if (this.sending || this.items.length === 0) {
      return;
    }
    const item = this.items[0];
    this.sending = item.id;
    this.emit("change", this.snapshot());
    this.sender.send(item.fn, item.args, item.id).then((ack) => this.onAck(item, ack)).catch((e) => {
      this.sending = null;
      if (!(e instanceof PhoneOfflineError)) {
        this.fail(item, e instanceof Error ? e.message : String(e));
      } else {
        this.emit("change", this.snapshot());
      }
    });
  }
  onAck(item, ack) {
    this.sending = null;
    if (ack.ok) {
      this.items = this.items.filter((i) => i.id !== item.id);
      this.persist();
      this.drain();
      return;
    }
    if (ack.error === "ack timeout" || ack.error === "phone disconnected") {
      this.emit("change", this.snapshot());
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.drain();
        }, RETRY_AFTER_TIMEOUT_MS);
      }
      return;
    }
    this.fail(item, ack.error ?? "failed");
  }
  fail(item, error) {
    this.items = this.items.filter((i) => i.id !== item.id);
    this.failed.push({ item, error, failedAt: (/* @__PURE__ */ new Date()).toISOString() });
    this.persist();
    this.drain();
  }
}
app.setName("Kelomit Companion");
protocol.registerSchemesAsPrivileged([
  { scheme: "kelomit-media", privileges: { secure: true, supportFetchAPI: true, stream: true } }
]);
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#161719" : "#F5F5F3",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      // ESM preload scripts can't be sandboxed (Electron docs); contextIsolation stays on.
      sandbox: false
    }
  });
  win.on("closed", () => {
    win = null;
  });
  if (process.env.KELOMIT_THEME === "light" || process.env.KELOMIT_THEME === "dark") {
    nativeTheme.themeSource = process.env.KELOMIT_THEME;
  }
  const query = {};
  if (process.env.KELOMIT_DATE) query.date = process.env.KELOMIT_DATE;
  if (process.env.KELOMIT_VIEW) query.view = process.env.KELOMIT_VIEW;
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    win.loadURL(url.toString());
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"), { query });
  }
  const shot = process.env.KELOMIT_SCREENSHOT;
  if (shot) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const image = await win?.webContents.capturePage();
        if (image) writeFileSync(shot, image.toPNG());
        app.quit();
      }, 1500);
    });
  }
}
app.whenReady().then(() => {
  const dataDir = ensureDataDir(app.getPath("userData"));
  const token = loadOrCreateToken(dataDir);
  const server = startApiServer(dataDir, token);
  const phone = new PhoneLink(server, token);
  const queue = new CommandQueue(join(dataDir, "queue.json"), phone);
  phone.on("state", (state) => {
    win?.webContents.send("phone-state", state);
    if (state.connected) queue.drain();
  });
  queue.on("change", (snapshot) => win?.webContents.send("queue-changed", snapshot));
  protocol.handle("kelomit-media", (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ""));
    if (!isSafeMediaName(name)) {
      return new Response("bad name", { status: 400 });
    }
    return net.fetch(pathToFileURL(mediaPath(dataDir, name)).toString());
  });
  registerReportIpc(dataDir);
  registerOffIpc();
  registerMediaIpc(dataDir, () => win);
  ipcMain.handle("pair-info", () => pairInfo(token));
  ipcMain.handle("phone-state", () => phone.state);
  ipcMain.handle("cmd", (_e, fn, args, label) => queue.push(fn, args, label));
  ipcMain.handle("queue", () => queue.snapshot());
  ipcMain.handle("queue-update", (_e, id, args, label) => queue.update(id, args, label));
  ipcMain.handle("queue-remove", (_e, id) => queue.remove(id));
  ipcMain.handle("queue-dismiss", (_e, id) => queue.dismissFailed(id));
  registerQueryIpc(dataDir);
  watchCurrentDb(dataDir, () => win?.webContents.send("db-changed"));
  if (process.env.KELOMIT_REPORT_PDF) {
    reportCheck(dataDir, process.env.KELOMIT_REPORT_PDF, "2026-09-01", "2026-09-16").catch((e) => {
      console.error("report check failed:", e);
      app.exit(1);
    });
    return;
  }
  installMenu(() => win);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
