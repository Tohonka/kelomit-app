import {getOrCreateDay, getDayByDate, updateDay} from '../../db/days';
import {getEntry, setEntryParent, updateEntry} from '../../db/entries';
import type {CreateEntryParams} from '../../db/entries';
import {createLeaveRange, updateLeaveRange, deleteLeaveRange} from '../../db/leaveRanges';
import type {CreateLeaveRangeInput} from '../../db/leaveRanges';
import {
  createFoodEntry,
  deleteFoodEntry,
  getFoodEntry,
  getProductByBarcode,
  getProductBySourceRef,
  updateFoodEntry,
  upsertProduct,
} from '../../db/food';
import type {CreateFoodEntryParams, FoodEntryFields, ProductFields} from '../../db/food';
import {
  archiveCategory,
  archiveHabit,
  createCategory,
  createHabit,
  deleteCategory,
  deleteHabit,
  setMatchers,
  setOverride,
  updateCategory,
  updateHabit,
} from '../../db/habits';
import type {CategoryFields, HabitFields} from '../../db/habits';
import {createNag, deleteNag, getNag, updateNag} from '../../db/nags';
import type {NagFields} from '../../db/nags';
import {markNagDone, syncNagTriggers} from '../nagService';
import {syncHabitWidgets} from '../habitWidgets';
import {deleteMediaFile} from '../../utils/mediaUtils';
import {
  createNamedPlaceForStop,
  deleteNamedPlace,
  renameNamedPlace,
  setDayStopName,
  updateNamedPlaceRadius,
} from '../../db/routeHistory';
import type {StopNameChoice} from '../../db/routeHistory';
import {useLocationStore} from '../../store/locationStore';
import {getSetting, setSetting} from '../../db/settings';
import {getOrCreateTag} from '../../db/tags';
import {useDayStore} from '../../store/dayStore';
import {useHabitStore} from '../../store/habitStore';
import {useEntryStore} from '../../store/entryStore';
import {useProjectStore} from '../../store/projectStore';
import {useTagStore} from '../../store/tagStore';
import type {Day, HabitMatcher, Project} from '../../types';

type EntryFields = Parameters<typeof updateEntry>[1];

/** The desktop can't know a tag's id before the phone creates it, so entry
 *  commands carry `tagNames`; resolved here to `tagIds` like the phone editor. */
type WithTagNames<T> = T & {tagNames?: string[]};

async function resolveTags<T extends {tagIds?: number[]}>(fields: WithTagNames<T>): Promise<T> {
  const {tagNames, ...rest} = fields;
  if (!tagNames) {
    return rest as T;
  }
  const tags = await Promise.all(tagNames.map(name => getOrCreateTag(name)));
  return {...rest, tagIds: tags.map(t => t.id)} as T;
}

/** Same trick for food products: the Mac sends the product it resolved (a
 *  Fineli pick or an Open Food Facts hit) and the phone finds-or-creates the
 *  row, so `product_id` is always the phone's own id. */
type WithProduct<T> = T & {product?: ProductFields};

async function resolveProduct<T extends {product_id?: number | null}>(fields: WithProduct<T>): Promise<T> {
  const {product, ...rest} = fields;
  if (!product) {
    return rest as T;
  }
  const existing =
    (product.barcode ? await getProductByBarcode(product.barcode) : null) ??
    (product.source_ref ? await getProductBySourceRef(product.source, product.source_ref) : null);
  const row = existing ?? (await upsertProduct(product));
  return {...rest, product_id: row.id} as T;
}

/** Habit writes: repaint the widgets, and the Habits tab if it has loaded. */
async function afterHabitWrite(): Promise<void> {
  await syncHabitWidgets().catch(() => {});
  if (useHabitStore.getState().loaded) {
    await useHabitStore.getState().load().catch(() => {});
  }
}

async function requireNag(id: number) {
  const nag = await getNag(id);
  if (!nag) {
    throw new Error(`nag ${id} not found`);
  }
  return nag;
}

type Matchers = Omit<HabitMatcher, 'habit_id'>[];

/**
 * Commands the desktop may send. Each one is a thin wrapper over the same
 * store action / db function the phone's own screens call, so every rule
 * (timer subnotes, tallies, leave overlap, source stamps) applies unchanged.
 * `fn` is looked up in this map and nothing else — never raw SQL.
 */
export interface Command {
  id: string;
  fn: string;
  args: unknown[];
}

export interface Ack {
  type: 'ack';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

type DayTimeFields = Partial<
  Pick<Day, 'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2' | 'notes'>
>;

/** Same stamping as dayStore.updateDayTimes, without touching the phone's
 *  selected day (a desktop edit must not change what the phone is showing). */
async function updateDayFromDesktop(date: string, fields: DayTimeFields): Promise<Day> {
  const day = await getOrCreateDay(date);
  const stamped: Parameters<typeof updateDay>[1] = {...fields};
  if ('started_at' in fields) {
    stamped.started_at_source = fields.started_at ? 'manual' : null;
  }
  if ('ended_at' in fields) {
    stamped.ended_at_source = fields.ended_at ? 'manual' : null;
  }
  await updateDay(day.id, stamped);
  const updated = (await getDayByDate(date)) ?? day;
  useDayStore.getState().refreshDay(updated);
  return updated;
}

async function requireEntry(id: number) {
  const entry = await getEntry(id);
  if (!entry) {
    throw new Error(`entry ${id} not found`);
  }
  return entry;
}

export const COMMANDS: Record<string, (...args: any[]) => Promise<unknown>> = {
  'entries.create': async (date: string, params: WithTagNames<Omit<CreateEntryParams, 'day_id'>>) => {
    const day = await getOrCreateDay(date);
    const resolved = await resolveTags(params);
    const entry = await useEntryStore.getState().addEntry({...resolved, day_id: day.id});
    return {id: entry.id, day_id: day.id};
  },
  'entries.update': async (id: number, fields: WithTagNames<EntryFields>) => {
    const entry = await requireEntry(id);
    await useEntryStore.getState().editEntry(id, await resolveTags(fields), entry.day_id);
  },
  'entries.delete': async (id: number) => {
    const entry = await requireEntry(id);
    await useEntryStore.getState().removeEntry(id, entry.day_id);
  },
  'entries.setTodoDone': async (id: number, done: boolean) => {
    const entry = await requireEntry(id);
    await useEntryStore.getState().setTodoDone(id, entry.day_id, done);
  },
  'entries.setParent': async (ids: number[], parentId: number | null) => {
    if (ids.length === 0) return;
    const entry = await requireEntry(ids[0]);
    await setEntryParent(ids, parentId);
    await useEntryStore.getState().loadEntriesForDay(entry.day_id);
  },
  'days.update': (date: string, fields: DayTimeFields) => updateDayFromDesktop(date, fields),
  'projects.create': (name: string, type: Project['type']) => useProjectStore.getState().add(name, type),
  'projects.rename': (id: number, name: string) => useProjectStore.getState().rename(id, name),
  'projects.archive': (id: number) => useProjectStore.getState().archive(id),
  'projects.unarchive': (id: number) => useProjectStore.getState().unarchive(id),
  'projects.delete': (id: number) => useProjectStore.getState().remove(id),
  'projects.merge': (keepId: number, dropId: number) => useProjectStore.getState().merge(keepId, dropId),
  'tags.getOrCreate': (name: string) => useTagStore.getState().getOrCreate(name),
  'tags.rename': (id: number, name: string) => useTagStore.getState().rename(id, name),
  'tags.delete': (id: number) => useTagStore.getState().remove(id),
  'tags.merge': (keepId: number, dropId: number) => useTagStore.getState().merge(keepId, dropId),
  'leaveRanges.create': (input: CreateLeaveRangeInput) => createLeaveRange(input),
  'leaveRanges.update': (id: number, input: CreateLeaveRangeInput) => updateLeaveRange(id, input),
  'leaveRanges.delete': (id: number) => deleteLeaveRange(id),
  'food.create': async (date: string, fields: WithProduct<Omit<CreateFoodEntryParams, 'day_id'>>) => {
    const day = await getOrCreateDay(date);
    const entry = await createFoodEntry({...(await resolveProduct(fields)), day_id: day.id});
    return {id: entry.id, day_id: day.id};
  },
  'food.update': async (id: number, fields: WithProduct<FoodEntryFields>) => {
    if (!(await getFoodEntry(id))) {
      throw new Error(`food entry ${id} not found`);
    }
    await updateFoodEntry(id, await resolveProduct(fields));
  },
  'food.delete': async (id: number) => {
    const entry = await getFoodEntry(id);
    if (!entry) {
      throw new Error(`food entry ${id} not found`);
    }
    await deleteFoodEntry(id);
    await deleteMediaFile(entry.file_path);
  },
  'habits.setOverride': async (habitId: number, date: string, done: boolean | null) => {
    await setOverride(habitId, date, done);
    await afterHabitWrite();
  },
  'habits.create': async (fields: HabitFields & {category_id: number; title: string}, matchers: Matchers = []) => {
    const habit = await createHabit(fields);
    await setMatchers(habit.id, matchers);
    await afterHabitWrite();
    return {id: habit.id};
  },
  'habits.update': async (id: number, fields: HabitFields, matchers?: Matchers) => {
    await updateHabit(id, fields);
    if (matchers) {
      await setMatchers(id, matchers);
    }
    await afterHabitWrite();
  },
  'habits.archive': async (id: number, archived = true) => {
    await archiveHabit(id, archived);
    await afterHabitWrite();
  },
  'habits.delete': async (id: number) => {
    await deleteHabit(id);
    await afterHabitWrite();
  },
  'habitCategories.create': async (fields: CategoryFields & {title: string}) => {
    const cat = await createCategory(fields);
    await afterHabitWrite();
    return {id: cat.id};
  },
  'habitCategories.update': async (id: number, fields: CategoryFields) => {
    await updateCategory(id, fields);
    await afterHabitWrite();
  },
  'habitCategories.archive': async (id: number, archived = true) => {
    await archiveCategory(id, archived);
    await afterHabitWrite();
  },
  'habitCategories.delete': async (id: number) => {
    await deleteCategory(id);
    await afterHabitWrite();
  },
  'nags.create': async (fields: NagFields) => {
    const nag = await createNag(fields);
    await syncNagTriggers();
    return {id: nag.id};
  },
  'nags.update': async (id: number, fields: Partial<NagFields> & {active?: boolean}) => {
    await requireNag(id);
    await updateNag(id, fields);
    await syncNagTriggers();
  },
  'nags.delete': async (id: number) => {
    await requireNag(id);
    await deleteNag(id);
    await syncNagTriggers();
  },
  'nags.setDone': async (id: number, dueAt: string, done = true) => {
    await markNagDone(await requireNag(id), dueAt, done);
  },
  // Same functions MapTab / PlacesSettings / LocationSettings call. Google
  // choices need the phone's Places lookup, so only saved / reusable / day.
  'stops.setName': async (stopId: number, choice: StopNameChoice) => {
    if (choice.type === 'google') {
      throw new Error('google stop names are picked on the phone');
    }
    await setDayStopName(stopId, choice);
  },
  'stops.createPlace': (stopId: number, name: string) => createNamedPlaceForStop(stopId, name),
  'places.rename': (id: number, name: string) => renameNamedPlace(id, name),
  'places.setRadius': (id: number, radiusM: number) => updateNamedPlaceRadius(id, radiusM),
  'places.delete': (id: number) => deleteNamedPlace(id),
  'locations.rename': (id: number, name: string) => useLocationStore.getState().rename(id, name),
  'locations.setRadius': (id: number, radiusM: number) => useLocationStore.getState().setRadius(id, radiusM),
  'locations.delete': (id: number) => useLocationStore.getState().remove(id),
};

const LAST_CMD_KEY = 'companion_last_cmd';

/** Runs one command and returns its ack. Never throws. A command whose id
 *  equals the last applied one is re-acked without running (the desktop
 *  re-sends when the socket dropped before the ack arrived). */
export async function runCommand(cmd: Command): Promise<Ack> {
  const handler = Object.prototype.hasOwnProperty.call(COMMANDS, cmd.fn) ? COMMANDS[cmd.fn] : null;
  if (!handler) {
    return {type: 'ack', id: cmd.id, ok: false, error: `unknown command: ${cmd.fn}`};
  }
  if ((await getSetting(LAST_CMD_KEY)) === cmd.id) {
    return {type: 'ack', id: cmd.id, ok: true, result: null};
  }
  try {
    const result = await handler(...(Array.isArray(cmd.args) ? cmd.args : []));
    await setSetting(LAST_CMD_KEY, cmd.id);
    return {type: 'ack', id: cmd.id, ok: true, result: result ?? null};
  } catch (e) {
    return {type: 'ack', id: cmd.id, ok: false, error: e instanceof Error ? e.message : String(e)};
  }
}
