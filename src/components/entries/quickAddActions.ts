import type {FabAction} from '../ui/FAB';
import type {EntryType} from '../../types';
import i18n from '../../i18n';

const TYPES: {type: EntryType; labelKey: string; icon: string}[] = [
  {type: 'note', labelKey: 'entryType.note', icon: 'note-plus-outline'},
  {type: 'photo', labelKey: 'entryType.photo', icon: 'camera'},
  {type: 'video', labelKey: 'entryType.video', icon: 'video'},
  {type: 'voice', labelKey: 'entryType.voice', icon: 'microphone'},
];

/** Speed-dial actions for the FAB long-press; `open` routes to QuickAddModal,
 *  `openFood` to the food log editor. */
export function buildQuickAddActions(
  open: (entryType: EntryType) => void,
  openFood: () => void,
  openNag?: () => void,
): FabAction[] {
  return [
    ...TYPES.map(t => ({
      key: t.type,
      label: i18n.t(t.labelKey),
      icon: t.icon,
      onPress: () => open(t.type),
    })),
    {key: 'food', label: i18n.t('food.logFood'), icon: 'silverware-fork-knife', onPress: openFood},
    ...(openNag ? [{key: 'nag', label: i18n.t('nags.new'), icon: 'bell-ring-outline', onPress: openNag}] : []),
  ];
}

/** Food-tab flavour of the dial: scan / my foods (the search) / a plain note. */
export function buildFoodQuickAddActions(
  openScan: () => void,
  openMyFoods: () => void,
  openNote: () => void,
): FabAction[] {
  return [
    {key: 'scan', label: i18n.t('food.scan'), icon: 'barcode-scan', onPress: openScan},
    {key: 'myfoods', label: i18n.t('food.myFoods'), icon: 'magnify', onPress: openMyFoods},
    {key: 'note', label: i18n.t('entryType.note'), icon: 'note-plus-outline', onPress: openNote},
  ];
}
