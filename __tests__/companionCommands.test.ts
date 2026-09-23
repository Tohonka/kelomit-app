jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn(async (date: string) => ({id: 7, date})),
  getDayByDate: jest.fn(async (date: string) => ({id: 7, date, started_at: 'x', started_at_source: 'manual'})),
  updateDay: jest.fn(async () => {}),
}));
jest.mock('../src/db/entries', () => ({
  getEntry: jest.fn(async (id: number) => (id === 404 ? null : {id, day_id: 7})),
  setEntryParent: jest.fn(async () => {}),
}));
jest.mock('../src/db/leaveRanges', () => ({
  createLeaveRange: jest.fn(async () => ({id: 1})),
  updateLeaveRange: jest.fn(async () => ({id: 1})),
  deleteLeaveRange: jest.fn(async () => {}),
}));
jest.mock('../src/db/tags', () => ({
  getOrCreateTag: jest.fn(async (name: string) => ({id: name.length, name})),
}));
/** jest.mock factories run when the (hoisted) import loads, before these consts
 *  exist — so every mocked module reaches its object lazily, through a Proxy. */
const lazy = (get: () => Record<string, unknown>) =>
  new Proxy({}, {get: (_t, k: string) => (...a: unknown[]) => (get()[k] as (...x: unknown[]) => unknown)(...a)});
const mockFood = {
  createFoodEntry: jest.fn(async (p: {day_id: number}) => ({id: 31, day_id: p.day_id})),
  updateFoodEntry: jest.fn(async () => {}),
  deleteFoodEntry: jest.fn(async () => {}),
  getFoodEntry: jest.fn(async (id: number) => (id === 404 ? null : {id, file_path: '/m/food.jpg'})),
  getProductByBarcode: jest.fn(async (code: string) => (code === '6410000000000' ? {id: 8} : null)),
  getProductBySourceRef: jest.fn(async () => null),
  upsertProduct: jest.fn(async () => ({id: 9})),
};
jest.mock('../src/db/food', () => lazy(() => mockFood));
const mockHabits = {
  createHabit: jest.fn(async () => ({id: 4})),
  updateHabit: jest.fn(async () => {}),
  archiveHabit: jest.fn(async () => {}),
  deleteHabit: jest.fn(async () => {}),
  setMatchers: jest.fn(async () => {}),
  setOverride: jest.fn(async () => {}),
  createCategory: jest.fn(async () => ({id: 2})),
  updateCategory: jest.fn(async () => {}),
  archiveCategory: jest.fn(async () => {}),
  deleteCategory: jest.fn(async () => {}),
};
jest.mock('../src/db/habits', () => lazy(() => mockHabits));
const mockNags = {
  getNag: jest.fn(async (id: number) => (id === 404 ? null : {id, title: 'Water'})),
  createNag: jest.fn(async () => ({id: 6})),
  updateNag: jest.fn(async () => {}),
  deleteNag: jest.fn(async () => {}),
};
jest.mock('../src/db/nags', () => lazy(() => mockNags));
const mockNagService = {markNagDone: jest.fn(async () => {}), syncNagTriggers: jest.fn(async () => 0)};
jest.mock('../src/services/nagService', () => lazy(() => mockNagService));
const mockSyncHabitWidgets = jest.fn(async () => true);
jest.mock('../src/services/habitWidgets', () => ({syncHabitWidgets: () => mockSyncHabitWidgets()}));
const mockDeleteMediaFile = jest.fn(async (_p: string) => {});
jest.mock('../src/utils/mediaUtils', () => ({deleteMediaFile: (p: string) => mockDeleteMediaFile(p)}));
const mockHabitStore = {loaded: true, load: jest.fn(async () => {})};
const mockRoutes = {
  setDayStopName: jest.fn(async () => {}),
  createNamedPlaceForStop: jest.fn(async () => {}),
  renameNamedPlace: jest.fn(async () => {}),
  updateNamedPlaceRadius: jest.fn(async () => {}),
  deleteNamedPlace: jest.fn(async () => {}),
};
jest.mock('../src/db/routeHistory', () => lazy(() => mockRoutes));
const mockLocationStore = {rename: jest.fn(async () => {}), setRadius: jest.fn(async () => {}), remove: jest.fn(async () => {})};
jest.mock('../src/store/locationStore', () => ({useLocationStore: {getState: () => mockLocationStore}}));
jest.mock('../src/store/habitStore', () => ({useHabitStore: {getState: () => mockHabitStore}}));
jest.mock('../src/db/settings', () => {
  const store: Record<string, string> = {};
  return {
    getSetting: jest.fn(async (k: string) => store[k] ?? null),
    setSetting: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
  };
});

const mockEntryStore = {
  addEntry: jest.fn(async (p: {day_id: number}) => ({id: 99, day_id: p.day_id})),
  editEntry: jest.fn(async () => {}),
  removeEntry: jest.fn(async () => {}),
  setTodoDone: jest.fn(async () => {}),
  loadEntriesForDay: jest.fn(async () => {}),
};
const mockDayStore = {refreshDay: jest.fn()};
const mockProjectStore = {add: jest.fn(async () => ({id: 3})), rename: jest.fn(async () => {})};
const mockTagStore = {getOrCreate: jest.fn(async () => ({id: 5}))};
jest.mock('../src/store/entryStore', () => ({useEntryStore: {getState: () => mockEntryStore}}));
jest.mock('../src/store/dayStore', () => ({useDayStore: {getState: () => mockDayStore}}));
jest.mock('../src/store/projectStore', () => ({useProjectStore: {getState: () => mockProjectStore}}));
jest.mock('../src/store/tagStore', () => ({useTagStore: {getState: () => mockTagStore}}));

import {runCommand} from '../src/services/companion/commands';
import {updateDay} from '../src/db/days';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runCommand', () => {
  it('rejects an unknown fn without touching anything', async () => {
    const ack = await runCommand({id: 'a', fn: 'settings.set', args: []});
    expect(ack).toMatchObject({ok: false, error: 'unknown command: settings.set'});
  });

  it('creates an entry on the day resolved from the date, through the store', async () => {
    const ack = await runCommand({id: 'b', fn: 'entries.create', args: ['2026-09-23', {entry_type: 'note', title: 'x'}]});
    expect(ack).toMatchObject({ok: true, result: {id: 99, day_id: 7}});
    expect(mockEntryStore.addEntry).toHaveBeenCalledWith({entry_type: 'note', title: 'x', day_id: 7});
  });

  it('resolves tagNames to ids on the phone before creating', async () => {
    await runCommand({id: 'b2', fn: 'entries.create', args: ['2026-09-23', {entry_type: 'note', tagNames: ['ab', 'cde']}]});
    expect(mockEntryStore.addEntry).toHaveBeenCalledWith({entry_type: 'note', tagIds: [2, 3], day_id: 7});
  });

  it('edits through the store with the entry’s own day id', async () => {
    await runCommand({id: 'c', fn: 'entries.update', args: [12, {title: 'y'}]});
    expect(mockEntryStore.editEntry).toHaveBeenCalledWith(12, {title: 'y'}, 7);
  });

  it('reports a missing entry as a failed ack', async () => {
    const ack = await runCommand({id: 'd', fn: 'entries.delete', args: [404]});
    expect(ack).toMatchObject({ok: false, error: 'entry 404 not found'});
    expect(mockEntryStore.removeEntry).not.toHaveBeenCalled();
  });

  it('stamps day sources like the phone and refreshes the store without selecting', async () => {
    await runCommand({id: 'e', fn: 'days.update', args: ['2026-09-23', {started_at: '2026-09-23T06:00:00.000Z', ended_at: null}]});
    expect(updateDay).toHaveBeenCalledWith(7, {
      started_at: '2026-09-23T06:00:00.000Z',
      ended_at: null,
      started_at_source: 'manual',
      ended_at_source: null,
    });
    expect(mockDayStore.refreshDay).toHaveBeenCalled();
  });

  it('re-acks a duplicate id without running it again', async () => {
    await runCommand({id: 'dup', fn: 'tags.getOrCreate', args: ['x']});
    const again = await runCommand({id: 'dup', fn: 'tags.getOrCreate', args: ['x']});
    expect(again).toMatchObject({ok: true});
    expect(mockTagStore.getOrCreate).toHaveBeenCalledTimes(1);
  });

  it('food.create resolves the sent product to the phone\'s own row before writing', async () => {
    const product = {barcode: '6410000000000', name: 'Milk', source: 'off', source_ref: '6410000000000'};
    const ack = await runCommand({id: 'f1', fn: 'food.create', args: ['2026-09-23', {eaten_at: 't', name: 'Milk', product}]});
    expect(ack).toMatchObject({ok: true, result: {id: 31, day_id: 7}});
    expect(mockFood.upsertProduct).not.toHaveBeenCalled();
    expect(mockFood.createFoodEntry).toHaveBeenCalledWith({eaten_at: 't', name: 'Milk', product_id: 8, day_id: 7});
  });

  it('food.create upserts an unknown product (Fineli pick) and links it', async () => {
    const product = {barcode: null, name: 'Puuro', source: 'fineli', source_ref: '123'};
    await runCommand({id: 'f2', fn: 'food.create', args: ['2026-09-23', {eaten_at: 't', name: 'Puuro', product}]});
    expect(mockFood.upsertProduct).toHaveBeenCalledWith(product);
    expect(mockFood.createFoodEntry).toHaveBeenCalledWith(expect.objectContaining({product_id: 9}));
  });

  it('food.delete removes the row and its photo file; a missing row is refused', async () => {
    expect(await runCommand({id: 'f3', fn: 'food.delete', args: [5]})).toMatchObject({ok: true});
    expect(mockFood.deleteFoodEntry).toHaveBeenCalledWith(5);
    expect(mockDeleteMediaFile).toHaveBeenCalledWith('/m/food.jpg');
    expect(await runCommand({id: 'f4', fn: 'food.delete', args: [404]})).toMatchObject({ok: false, error: 'food entry 404 not found'});
  });

  it('habits.create writes the habit and its matchers, then repaints widgets and the loaded store', async () => {
    const matchers = [{kind: 'tag', ref_id: 3, threshold: null}];
    const ack = await runCommand({id: 'h1', fn: 'habits.create', args: [{category_id: 1, title: 'Run'}, matchers]});
    expect(ack).toMatchObject({ok: true, result: {id: 4}});
    expect(mockHabits.setMatchers).toHaveBeenCalledWith(4, matchers);
    expect(mockSyncHabitWidgets).toHaveBeenCalled();
    expect(mockHabitStore.load).toHaveBeenCalled();
  });

  it('habits.setOverride passes null through (back to auto)', async () => {
    await runCommand({id: 'h2', fn: 'habits.setOverride', args: [4, '2026-09-23', null]});
    expect(mockHabits.setOverride).toHaveBeenCalledWith(4, '2026-09-23', null);
  });

  it('nags.update re-syncs alarms; nags.setDone goes through markNagDone with the nag row', async () => {
    await runCommand({id: 'n1', fn: 'nags.update', args: [6, {active: false}]});
    expect(mockNags.updateNag).toHaveBeenCalledWith(6, {active: false});
    expect(mockNagService.syncNagTriggers).toHaveBeenCalledTimes(1);
    await runCommand({id: 'n2', fn: 'nags.setDone', args: [6, '2026-09-23T07:00:00.000Z', true]});
    expect(mockNagService.markNagDone).toHaveBeenCalledWith({id: 6, title: 'Water'}, '2026-09-23T07:00:00.000Z', true);
    expect(await runCommand({id: 'n3', fn: 'nags.delete', args: [404]})).toMatchObject({ok: false, error: 'nag 404 not found'});
  });

  it('stops.setName applies saved/reusable/day choices and refuses google ones', async () => {
    await runCommand({id: 's1', fn: 'stops.setName', args: [12, {type: 'day', name: 'Kahvila'}]});
    expect(mockRoutes.setDayStopName).toHaveBeenCalledWith(12, {type: 'day', name: 'Kahvila'});
    const ack = await runCommand({id: 's2', fn: 'stops.setName', args: [12, {type: 'google', placeId: 'x', name: 'y'}]});
    expect(ack).toMatchObject({ok: false, error: 'google stop names are picked on the phone'});
    await runCommand({id: 's3', fn: 'stops.createPlace', args: [12, 'Koti']});
    expect(mockRoutes.createNamedPlaceForStop).toHaveBeenCalledWith(12, 'Koti');
  });

  it('locations.* go through the location store so geofences re-register', async () => {
    await runCommand({id: 'l1', fn: 'locations.setRadius', args: [3, 80]});
    expect(mockLocationStore.setRadius).toHaveBeenCalledWith(3, 80);
    await runCommand({id: 'l2', fn: 'places.rename', args: [4, 'Työ']});
    expect(mockRoutes.renameNamedPlace).toHaveBeenCalledWith(4, 'Työ');
  });
});
