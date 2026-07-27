const mockExecute = jest.fn();

jest.mock('../src/db/database', () => ({
  getDB: () => ({execute: mockExecute}),
}));

import {getAllSettings} from '../src/db/settings';

beforeEach(() => {
  jest.clearAllMocks();
});

it('loads a valid pay-period start day', async () => {
  mockExecute.mockResolvedValueOnce({
    rows: [{key: 'pay_period_start_day', value: '26'}],
  });

  await expect(getAllSettings()).resolves.toMatchObject({
    pay_period_start_day: 26,
  });
});

it.each(['0', '29', '2.5', 'nope'])(
  'falls back to day 1 for invalid stored value %s',
  async value => {
    mockExecute.mockResolvedValueOnce({
      rows: [{key: 'pay_period_start_day', value}],
    });

    await expect(getAllSettings()).resolves.toMatchObject({
      pay_period_start_day: 1,
    });
  },
);
