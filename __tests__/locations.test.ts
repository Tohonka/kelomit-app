jest.mock('../src/db/database', () => ({
  getDB: jest.fn(),
}));

import {getDB} from '../src/db/database';
import {getLocations, updateLocationName} from '../src/db/locations';

const mockGetDB = getDB as jest.MockedFunction<typeof getDB>;

const result = (rows: Record<string, unknown>[] = [], rowsAffected = 0) => ({
  rows,
  rowsAffected,
});

function mockDatabase(executeResults: ReturnType<typeof result>[] = []) {
  const execute = jest.fn();
  for (const queued of executeResults) {
    execute.mockResolvedValueOnce(queued);
  }
  execute.mockResolvedValue(result());
  const db = {execute};
  mockGetDB.mockReturnValue(db as unknown as ReturnType<typeof getDB>);
  return {db, execute};
}

describe('locations repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renames a saved location and re-reads it', async () => {
    const {execute} = mockDatabase([
      result([{id: 3, name: 'Renamed', updated_at: 'updated-2'}]),
    ]);

    await updateLocationName(3, '  Renamed  ');
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/^UPDATE locations SET name/i),
      ['Renamed', 3],
    );

    execute.mockClear();
    execute.mockResolvedValueOnce(
      result([{id: 3, name: 'Renamed', updated_at: 'updated-2'}]),
    );
    await expect(getLocations()).resolves.toEqual([
      {id: 3, name: 'Renamed', updated_at: 'updated-2'},
    ]);
  });

  it('rejects an empty location name', async () => {
    const {execute} = mockDatabase();

    await expect(updateLocationName(3, '  ')).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});
