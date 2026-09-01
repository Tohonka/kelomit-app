export interface Migration {
  version: number;
  up: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE IF NOT EXISTS days (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL UNIQUE,
        started_at  TEXT,
        ended_at    TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      `CREATE TABLE IF NOT EXISTS projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        type        TEXT NOT NULL DEFAULT 'work'
                      CHECK(type IN ('work','personal','other')),
        archived    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      `CREATE TABLE IF NOT EXISTS entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id          INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        entry_type      TEXT NOT NULL CHECK(entry_type IN ('note','photo','video','voice')),
        activity_type   TEXT NOT NULL DEFAULT 'work'
                          CHECK(activity_type IN ('work','personal_work','personal')),
        title           TEXT,
        body            TEXT,
        project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        file_path       TEXT,
        thumbnail_path  TEXT,
        duration_sec    INTEGER,
        time_from       TEXT,
        time_to         TEXT,
        latitude        REAL,
        longitude       REAL,
        location_label  TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      `CREATE TABLE IF NOT EXISTS gps_track (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id      INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        latitude    REAL NOT NULL,
        longitude   REAL NOT NULL,
        accuracy    REAL,
        altitude    REAL,
        speed       REAL,
        timestamp   TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,

      `CREATE TABLE IF NOT EXISTS entry_tags (
        entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (entry_id, tag_id)
      )`,

      `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )`,

      "INSERT OR IGNORE INTO settings (key, value) VALUES ('gps_enabled', 'true')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('gps_interval_ms', '60000')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('default_activity_type', 'work')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('default_project_id', '')",
    ],
  },
  {
    version: 2,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_mode', 'system')",
    ],
  },
  {
    version: 3,
    up: [
      'ALTER TABLE days ADD COLUMN started_at_2 TEXT',
      'ALTER TABLE days ADD COLUMN ended_at_2 TEXT',
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('show_week_numbers', 'false')",
    ],
  },
  {
    version: 4,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('time_selector_mode', 'clock')",
    ],
  },
  {
    version: 5,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('quickadd_default_project_id', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('quickadd_default_tag', 'Quick add')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('quickadd_default_activity', 'work')",
    ],
  },
  {
    version: 6,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('language', '')",
    ],
  },
  {
    version: 7,
    up: [
      'ALTER TABLE entries ADD COLUMN is_todo INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE entries ADD COLUMN scheduled_date TEXT',
      'ALTER TABLE entries ADD COLUMN completed_at TEXT',
    ],
  },
  {
    version: 8,
    up: [
      'ALTER TABLE entries ADD COLUMN reminder_at TEXT',
    ],
  },
  {
    version: 9,
    up: [
      `CREATE TABLE IF NOT EXISTS locations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL DEFAULT 'work'
                      CHECK(kind IN ('work','home','other')),
        latitude    REAL NOT NULL,
        longitude   REAL NOT NULL,
        radius_m    INTEGER NOT NULL DEFAULT 150,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS geofence_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        day_id      INTEGER REFERENCES days(id) ON DELETE CASCADE,
        event_type  TEXT NOT NULL CHECK(event_type IN ('enter','exit')),
        latitude    REAL,
        longitude   REAL,
        timestamp   TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 10,
    up: [
      // End-of-day confirmation log (Iteration 3 Phase 8.2). `confirmed` is NULL
      // until the user answers the Yes/No prompt, then 1 (kept) or 0 (cleared).
      `CREATE TABLE IF NOT EXISTS day_end_confirmations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id        INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        proposed_end  TEXT NOT NULL,
        confirmed     INTEGER,
        responded_at  TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    version: 11,
    up: [
      // Iteration 4 — "Everything is a Note". Media moves from inline entry
      // columns to a separate table so a note can hold 0..N attachments,
      // addable any time. Legacy entries.* media columns are kept (additive,
      // no data loss) and become unused for new media.
      `CREATE TABLE IF NOT EXISTS entry_media (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id       INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        media_type     TEXT NOT NULL CHECK(media_type IN ('photo','video','voice')),
        file_path      TEXT NOT NULL,
        thumbnail_path TEXT,
        duration_sec   INTEGER,
        position       INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Backfill: turn every existing photo/video/voice entry's inline file
      // into one attachment row. Lossless.
      `INSERT INTO entry_media (entry_id, media_type, file_path, thumbnail_path, duration_sec, position)
       SELECT id, entry_type, file_path, thumbnail_path, duration_sec, 0
       FROM entries
       WHERE entry_type IN ('photo','video','voice') AND file_path IS NOT NULL`,
    ],
  },
  {
    version: 12,
    up: [
      // Iteration 5.2 — every entry on equal footing on the timeline. Duration
      // entries used to carry no timestamp, so the hours model couldn't place
      // them. Backfill a real from→to: start = creation time, end = start +
      // duration. Written as UTC ISO (T…Z) so new Date() reads them as UTC,
      // matching range-mode entries. New duration entries get this at write time.
      `UPDATE entries
          SET time_from = strftime('%Y-%m-%dT%H:%M:%SZ', created_at),
              time_to   = strftime('%Y-%m-%dT%H:%M:%SZ', created_at, '+' || duration_sec || ' seconds')
        WHERE duration_sec IS NOT NULL AND time_from IS NULL`,
    ],
  },
  {
    version: 13,
    up: [
      // Iteration 5.5 — denser trail recording + 7-day retention turn the
      // per-day map query and the startup prune into full-table scans as data
      // accumulates. Index the two columns they filter on.
      'CREATE INDEX IF NOT EXISTS idx_gps_track_day ON gps_track(day_id)',
      'CREATE INDEX IF NOT EXISTS idx_gps_track_ts ON gps_track(timestamp)',
    ],
  },
  {
    version: 14,
    up: [
      // Phase 1 voice transcription — store the speech-to-text result on the
      // voice attachment itself. Nullable, editable. No backfill: zero voice
      // clips exist yet.
      'ALTER TABLE entry_media ADD COLUMN transcript TEXT',
    ],
  },
  {
    version: 15,
    up: [
      // On-device diagnostics — structured, queryable event log for debugging
      // intermittent GPS / background-service behaviour over days of real use.
      // The parallel flat `diag.log` file (written by JS AND the native FGS) is
      // the survives-process-death timeline; this table is the JS-side queryable
      // half, fed by the single logDiag() hook. Retention-pruned by time.
      `CREATE TABLE IF NOT EXISTS diag_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      TEXT NOT NULL,
        source  TEXT,
        tag     TEXT,
        msg     TEXT,
        data    TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_diag_log_ts ON diag_log(ts)',
    ],
  },
  {
    version: 16,
    up: [
      // Places lookup cache — names for stays that don't fall inside a saved
      // location, keyed by lat,lng rounded to ~11 m so we never re-bill Google
      // for the same spot. Empty name = "checked, nothing nearby" (cached too).
      `CREATE TABLE IF NOT EXISTS place_cache (
        cell        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        place_id    TEXT,
        fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    version: 17,
    up: [
      // The Places key now comes from the build config (.maps.env), not the DB.
      // Purge any plain-text copy an earlier build stored in settings.
      "DELETE FROM settings WHERE key = 'places_api_key'",
    ],
  },
  {
    version: 18,
    up: [
      // Provenance for auto-detected vs manually-entered day times, so the
      // detection redesign never overwrites a value the user set by hand.
      'ALTER TABLE days ADD COLUMN started_at_source TEXT',
      'ALTER TABLE days ADD COLUMN ended_at_source TEXT',
    ],
  },
  {
    version: 19,
    up: [
      // Native workday decisions carry a stable token so replaying the durable
      // Android journal cannot create duplicate prompts or apply stale answers.
      'ALTER TABLE day_end_confirmations ADD COLUMN native_token TEXT',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_day_end_confirmations_native_token ON day_end_confirmations(native_token)',
    ],
  },
  {
    version: 20,
    up: [
      `CREATE TABLE IF NOT EXISTS named_places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_m REAL NOT NULL DEFAULT 70,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS day_route_stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        start_ts TEXT NOT NULL,
        end_ts TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        saved_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        named_place_id INTEGER REFERENCES named_places(id) ON DELETE SET NULL,
        google_place_id TEXT,
        display_name TEXT,
        name_source TEXT NOT NULL DEFAULT 'unknown'
          CHECK (name_source IN ('saved','reusable','google','day','unknown')),
        user_edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS day_route_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        start_ts TEXT NOT NULL,
        end_ts TEXT NOT NULL,
        origin_stop_id INTEGER REFERENCES day_route_stops(id) ON DELETE SET NULL,
        destination_stop_id INTEGER REFERENCES day_route_stops(id) ON DELETE SET NULL,
        coordinates_json TEXT NOT NULL,
        distance_m REAL NOT NULL,
        duration_sec REAL NOT NULL,
        average_speed_mps REAL NOT NULL,
        maximum_speed_mps REAL NOT NULL,
        raw_last_ts TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(day_id, sequence)
      )`,
      'ALTER TABLE place_cache ADD COLUMN candidates_json TEXT',
      'CREATE INDEX IF NOT EXISTS idx_named_places_coords ON named_places(latitude, longitude)',
      'CREATE INDEX IF NOT EXISTS idx_route_stops_day_time ON day_route_stops(day_id, start_ts)',
      'CREATE INDEX IF NOT EXISTS idx_route_stops_saved ON day_route_stops(saved_location_id)',
      'CREATE INDEX IF NOT EXISTS idx_route_stops_named ON day_route_stops(named_place_id)',
      'CREATE INDEX IF NOT EXISTS idx_route_segments_day_sequence ON day_route_segments(day_id, sequence)',
      'CREATE INDEX IF NOT EXISTS idx_route_segments_origin ON day_route_segments(origin_stop_id)',
      'CREATE INDEX IF NOT EXISTS idx_route_segments_destination ON day_route_segments(destination_stop_id)',
    ],
  },
  {
    version: 21,
    up: [
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_url', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_token', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_last_at', '')",
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_last_error', '')",
    ],
  },
  {
    version: 22,
    up: [
      `CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity TEXT NOT NULL
          CHECK (activity IN ('still','walking','running','on_foot','bicycle','vehicle')),
        transition TEXT NOT NULL
          CHECK (transition IN ('enter','exit')),
        timestamp TEXT NOT NULL,
        UNIQUE(activity, transition, timestamp)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_activity_events_ts ON activity_events(timestamp)',
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('route_derivation_version', '1')",
    ],
  },
  {
    version: 23,
    up: [
      `ALTER TABLE entries ADD COLUMN is_overtime INTEGER NOT NULL DEFAULT 0
        CHECK(is_overtime IN (0, 1))`,
      `CREATE TABLE IF NOT EXISTS leave_ranges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL
          CHECK(type IN ('paid_day_off','unpaid_day_off','vacation','sick')),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(start_date <= end_date)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_leave_ranges_dates ON leave_ranges(start_date, end_date)',
      "INSERT OR IGNORE INTO settings (key, value) VALUES ('pay_period_start_day', '1')",
    ],
  },
  {
    version: 24,
    up: [
      // Widget iteration 1 — per-project note numbering. The tally lives in a
      // join table (multi-project-ready: a note could later be Banana #5 AND
      // Pudding #1); entries.project_id remains the single primary project.
      // next_tally never decrements — deleting Banana #5 burns #5 forever.
      'ALTER TABLE projects ADD COLUMN next_tally INTEGER NOT NULL DEFAULT 1',
      `CREATE TABLE IF NOT EXISTS entry_projects (
        entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        tally      INTEGER NOT NULL,
        PRIMARY KEY (entry_id, project_id)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_entry_projects_project ON entry_projects(project_id)',
      // Backfill: number every existing project note by creation order.
      `INSERT INTO entry_projects (entry_id, project_id, tally)
       SELECT id, project_id,
              ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id)
         FROM entries
        WHERE project_id IS NOT NULL`,
      `UPDATE projects
          SET next_tally = COALESCE(
            (SELECT MAX(tally) + 1 FROM entry_projects WHERE project_id = projects.id), 1)`,
    ],
  },
  {
    version: 25,
    up: [
      // Routes iteration 1 — per-trip enrichment computed at derivation time
      // (raw gps/activity data prunes at 45 days; these survive). Null = row
      // predates v25 / raw data was gone: UI falls back to today's rendering.
      'ALTER TABLE day_route_segments ADD COLUMN mode_spans_json TEXT',
      'ALTER TABLE day_route_segments ADD COLUMN still_seconds REAL',
      'ALTER TABLE day_route_segments ADD COLUMN via_json TEXT',
    ],
  },
  {
    version: 26,
    up: [
      // Subnotes (plan 2026-09-01 Task 3): a note may belong to a parent note.
      // Children share the parent's day_id; deleting a parent deletes its subnotes.
      'ALTER TABLE entries ADD COLUMN parent_id INTEGER REFERENCES entries(id) ON DELETE CASCADE',
      'CREATE INDEX IF NOT EXISTS idx_entries_parent ON entries(parent_id)',
    ],
  },
];
