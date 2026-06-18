export type ActivityType = 'work' | 'personal_work' | 'personal';
export type EntryType = 'note' | 'photo' | 'video' | 'voice';
/** Kinds of media that can be attached to a note (Iteration 4). */
export type MediaType = 'photo' | 'video' | 'voice';
export type ProjectType = 'work' | 'personal' | 'other';

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
  created_at: string;
  updated_at: string;
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
}
