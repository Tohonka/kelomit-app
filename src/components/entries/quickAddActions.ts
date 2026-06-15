import type {FabAction} from '../ui/FAB';
import type {EntryType} from '../../types';

const TYPES: {type: EntryType; label: string; icon: string}[] = [
  {type: 'note', label: 'Note', icon: 'note-plus-outline'},
  {type: 'photo', label: 'Photo', icon: 'camera'},
  {type: 'video', label: 'Video', icon: 'video'},
  {type: 'voice', label: 'Voice', icon: 'microphone'},
];

/** Speed-dial actions for the FAB long-press; `open` routes to QuickAddModal. */
export function buildQuickAddActions(open: (entryType: EntryType) => void): FabAction[] {
  return TYPES.map(t => ({
    key: t.type,
    label: t.label,
    icon: t.icon,
    onPress: () => open(t.type),
  }));
}
