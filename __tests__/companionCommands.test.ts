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
});
