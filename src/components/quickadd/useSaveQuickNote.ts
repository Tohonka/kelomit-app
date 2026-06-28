import {useCallback} from 'react';
import {useEntryStore} from '../../store/entryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useTagStore} from '../../store/tagStore';
import {addEntryMedia} from '../../db/entries';
import {getLastKnownPosition} from '../../services/gpsService';
import type {EditorMedia} from '../media/AttachmentsSection';

interface SaveQuickNoteInput {
  dayId: number;
  title: string;
  durationMinutes: string;
  media: EditorMedia[];
}

// Shared data-side save for the quick-note path. UI concerns (saving flag,
// haptic, navigation/close) stay in each caller.
export function useSaveQuickNote() {
  const {addEntry, loadEntriesForDay} = useEntryStore();
  const {getOrCreate} = useTagStore();
  const quickadd_default_activity = useSettingsStore(s => s.quickadd_default_activity);
  const quickadd_default_project_id = useSettingsStore(s => s.quickadd_default_project_id);
  const quickadd_default_tag = useSettingsStore(s => s.quickadd_default_tag);

  return useCallback(
    async ({dayId, title, durationMinutes, media}: SaveQuickNoteInput): Promise<void> => {
      const durationSec = durationMinutes.trim()
        ? Math.round(parseFloat(durationMinutes) * 60)
        : null;

      const tagName = quickadd_default_tag.trim();
      const tagIds: number[] = [];
      if (tagName) {
        const tag = await getOrCreate(tagName);
        tagIds.push(tag.id);
      }

      const gps = getLastKnownPosition();
      const created = await addEntry({
        day_id: dayId,
        entry_type: 'note',
        activity_type: quickadd_default_activity,
        title: title.trim() || null,
        body: null,
        project_id: quickadd_default_project_id,
        tagIds,
        duration_sec: durationSec,
        time_from: null,
        time_to: null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
      });
      for (const m of media) {
        await addEntryMedia(created.id, {
          media_type: m.media_type,
          file_path: m.file_path,
          thumbnail_path: m.thumbnail_path,
          duration_sec: m.duration_sec,
        });
      }
      await loadEntriesForDay(dayId);
    },
    [
      addEntry,
      loadEntriesForDay,
      getOrCreate,
      quickadd_default_activity,
      quickadd_default_project_id,
      quickadd_default_tag,
    ],
  );
}
