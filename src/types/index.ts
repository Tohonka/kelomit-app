export type ActivityType = 'work' | 'personal_work' | 'personal';
export type EntryType = 'note' | 'photo' | 'video' | 'voice';
/** Kinds of media that can be attached to a note (Iteration 4). */
export type MediaType = 'photo' | 'video' | 'voice';
export type ProjectType = 'work' | 'personal' | 'other';
export type LeaveType =
  | 'paid_day_off'
  | 'unpaid_day_off'
  | 'vacation'
  | 'sick';

export interface Project {
  id: number;
  name: string;
  type: ProjectType;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface Day {
  id: number;
  date: string;
  started_at: string | null;
  ended_at: string | null;
  started_at_2: string | null;
  ended_at_2: string | null;
  started_at_source: string | null;
  ended_at_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: number;
  day_id: number;
  entry_type: EntryType;
  activity_type: ActivityType;
  project_id: number | null;
  /** Subnote of this entry (schema v26). Null = top-level note. */
  parent_id: number | null;
  /** Per-project note number (entry_projects join). Null when no project, or
   *  in read paths that don't fetch it (search, gallery, todos). */
  tally: number | null;
  title: string | null;
  body: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  duration_sec: number | null;
  time_from: string | null;
  time_to: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  is_todo: boolean;
  is_overtime: boolean;
  scheduled_date: string | null;
  completed_at: string | null;
  reminder_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  project?: Project | null;
  /** Media attachments (Iteration 4). A note can carry 0..N. */
  media?: EntryMedia[];
}

export interface LeaveRange {
  id: number;
  type: LeaveType;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

/** A single media attachment on an entry (Iteration 4 — `entry_media` table). */
export interface EntryMedia {
  id: number;
  entry_id: number;
  media_type: MediaType;
  file_path: string;
  thumbnail_path: string | null;
  duration_sec: number | null;
  /** Ordering within the note (0-based). */
  position: number;
  transcript: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A running time-tracking session (Iteration 3 Phase 9). At most one is active
 * at a time. It is the shared model behind the in-app quick timer and — later —
 * the home-screen widgets. Persisted so it survives the app being killed; on
 * stop it becomes a normal `entry_type:'note'` entry with `duration_sec`.
 */
export interface ActiveSession {
  /** When tracking began — ISO 8601 (`toISOString()`, ends in `Z`). */
  started_at: string;
  project_id: number | null;
  activity_type: ActivityType;
  /** Tag names to apply to the logged note (resolved to ids on stop). */
  tags: string[];
  title: string | null;
  /** Where the session was started from. */
  source: 'timer' | 'widget';
  /** Display name from the starting widget/config (falls back to project name
   *  in titles). Optional: sessions persisted before iteration W1 lack it. */
  name?: string | null;
  /** Work ms from segments already closed by pause. Absent = 0. */
  accumulated_ms?: number;
  /** Set while paused (ISO); null/absent = running. */
  paused_at?: string | null;
  /** appWidgetId of the widget that started this session; null/absent for
   *  in-app sessions. Only the owning widget renders the running state. */
  widget_id?: number | null;
}

export type LocationKind = 'work' | 'home' | 'other';

export interface SavedLocation {
  id: number;
  name: string;
  kind: LocationKind;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_at: string;
  updated_at: string;
}

export interface GeofenceEvent {
  id: number;
  location_id: number | null;
  day_id: number | null;
  event_type: 'enter' | 'exit';
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

export interface DayEndConfirmation {
  id: number;
  day_id: number;
  proposed_end: string;
  native_token: string | null;
  /** null = unanswered, 1 = kept (yes), 0 = cleared (no). */
  confirmed: number | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GpsPoint {
  day_id: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  timestamp: string;
}

export type ActivityKind =
  | 'still'
  | 'walking'
  | 'running'
  | 'on_foot'
  | 'bicycle'
  | 'vehicle';

export type ActivityTransition = 'enter' | 'exit';

export interface ActivityEvent {
  activity: ActivityKind;
  transition: ActivityTransition;
  timestamp: string;
}

export type RouteStopNameSource =
  | 'saved'
  | 'reusable'
  | 'google'
  | 'day'
  | 'unknown';

export interface NamedPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_at: string;
  updated_at: string;
}

export interface DayRouteStop {
  id: number;
  day_id: number;
  start_ts: string;
  end_ts: string;
  latitude: number;
  longitude: number;
  saved_location_id: number | null;
  named_place_id: number | null;
  google_place_id: string | null;
  display_name: string | null;
  name_source: RouteStopNameSource;
  user_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
  /** Epoch ms of the source fix. Absent on rows derived before v25. */
  t?: number;
}

export type TripMode = 'vehicle' | 'foot' | 'cycle' | 'still' | 'unknown';

export interface ModeSpan {
  mode: TripMode;
  startTs: string; // ISO, clipped to the trip window
  endTs: string;
}

export type TripVia =
  | {kind: 'pause'; startTs: string; endTs: string; name: string | null}
  | {kind: 'passthrough'; ts: string; name: string};

export interface DayRouteSegment {
  id: number;
  day_id: number;
  sequence: number;
  start_ts: string;
  end_ts: string;
  origin_stop_id: number | null;
  destination_stop_id: number | null;
  coordinates: RouteCoordinate[];
  distance_m: number;
  duration_sec: number;
  average_speed_mps: number;
  maximum_speed_mps: number;
  raw_last_ts: string;
  mode_spans: ModeSpan[] | null;
  still_seconds: number | null;
  via: TripVia[] | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  gps_enabled: boolean;
  gps_interval_ms: number;
  default_activity_type: ActivityType;
  default_project_id: number | null;
  /** Usual working hours as wall-clock "HH:mm", or null if unset. */
  usual_start: string | null;
  usual_end: string | null;
  /** When true, a newly-created day is seeded with the usual hours. */
  prefill_from_usual: boolean;
  pay_period_start_day: number;
}
