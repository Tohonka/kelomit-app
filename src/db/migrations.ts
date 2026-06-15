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
];
