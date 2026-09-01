const kv: Record<string, string> = {};
const mockRead = jest.fn();
const mockCreateEntry = jest.fn();

jest.mock('../src/db/settings', () => ({
  getSetting: async (k: string) => kv[k] ?? null,
  setSetting: async (k: string, v: string) => { kv[k] = v; },
}));
jest.mock('../src/db/activeSession', () => ({
  readActiveSession: (...a: unknown[]) => mockRead(...a),
}));
jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn(async () => ({id: 42, date: '2026-09-01'})),
}));
jest.mock('../src/db/tags', () => ({
  getOrCreateTag: jest.fn(async (name: string) => ({id: name.length, name})),
}));
jest.mock('../src/db/entries', () => ({
  createEntry: (...a: unknown[]) => mockCreateEntry(...a),
}));

import {
  resolveTimerParent,
  getTimerParentId,
  clearTimerParent,
  useTimerParent,
} from '../src/services/timerSubnotes';

const session = (over = {}) => ({
  started_at: '2026-09-01T08:00:00.000Z', project_id: 5, activity_type: 'work',
  tags: ['site'], title: null, source: 'timer', name: 'Banana', paused_at: null, ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  for (const k of Object.keys(kv)) { delete kv[k]; }
  useTimerParent.setState({parentId: null});
  mockCreateEntry.mockResolvedValue({id: 77});
});

it('no running timer → no parent (null session, paused session)', async () => {
  mockRead.mockResolvedValue(null);
  expect(await resolveTimerParent()).toBeNull();
  mockRead.mockResolvedValue(session({paused_at: '2026-09-01T09:00:00.000Z'}));
  expect(await resolveTimerParent()).toBeNull();
  expect(mockCreateEntry).not.toHaveBeenCalled();
});

it('first capture creates the in-progress parent once; later captures reuse it', async () => {
  mockRead.mockResolvedValue(session());
  expect(await resolveTimerParent()).toBe(77);
  expect(mockCreateEntry).toHaveBeenCalledTimes(1);
  expect(mockCreateEntry.mock.calls[0][0]).toMatchObject({
    day_id: 42, project_id: 5, activity_type: 'work', tagIds: [4],
    time_from: '2026-09-01T08:00:00.000Z', time_to: null,
  });
  expect(useTimerParent.getState().parentId).toBe(77);

  expect(await resolveTimerParent()).toBe(77);
  expect(mockCreateEntry).toHaveBeenCalledTimes(1);
});

it('survives a restart via the settings KV, and clears', async () => {
  kv.timer_parent_entry = '31';
  expect(await getTimerParentId()).toBe(31);
  expect(useTimerParent.getState().parentId).toBe(31);
  await clearTimerParent();
  expect(await getTimerParentId()).toBeNull();
  expect(useTimerParent.getState().parentId).toBeNull();
});
