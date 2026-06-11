export type ActivityType = 'work' | 'personal_work' | 'personal';
export type EntryType = 'note' | 'photo' | 'video' | 'voice';
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
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  project?: Project | null;
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
}
