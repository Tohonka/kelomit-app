import type {FabAction} from '../ui/FAB';
import type {EntryType} from '../../types';
import i18n from '../../i18n';

const TYPES: {type: EntryType; labelKey: string; icon: string}[] = [
  {type: 'note', labelKey: 'entryType.note', icon: 'note-plus-outline'},
  {type: 'photo', labelKey: 'entryType.photo', icon: 'camera'},
  {type: 'video', labelKey: 'entryType.video', icon: 'video'},
  {type: 'voice', labelKey: 'entryType.voice', icon: 'microphone'},
];

/** Speed-dial actions for the FAB long-press; `open` routes to QuickAddModal. */
export function buildQuickAddActions(open: (entryType: EntryType) => void): FabAction[] {
  return TYPES.map(t => ({
    key: t.type,
    label: i18n.t(t.labelKey),
    icon: t.icon,
    onPress: () => open(t.type),
  }));
}
