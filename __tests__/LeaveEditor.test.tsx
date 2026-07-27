import React from 'react';
import {Alert, TouchableOpacity} from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

jest.mock('../src/db/leaveRanges', () => ({
  createLeaveRange: jest.fn(),
  updateLeaveRange: jest.fn(),
  deleteLeaveRange: jest.fn(),
  getLeaveRange: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'leave.paidDayOff': 'Day off (paid)',
      'leave.unpaidDayOff': 'Day off (unpaid)',
      'leave.vacation': 'Vacation',
      'leave.sick': 'Sick',
      'leave.startDate': 'Start date',
      'leave.endDate': 'End date',
      'leave.overlap': 'This leave overlaps an incompatible leave period.',
      'leave.invalidRange': 'The start date must be before the end date.',
      'leave.saveFailed': 'Could not save leave.',
      'common.save': 'Save',
      'common.update': 'Update',
      'common.delete': 'Delete',
      'common.error': 'Error',
    }[key] ?? key),
  }),
}));
jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: {changeLanguage: jest.fn()},
}));
jest.mock('../src/theme', () => {
  const actual = jest.requireActual('../src/theme');
  const {lightColors} = jest.requireActual('../src/theme/colors');
  return {...actual, useTheme: () => ({colors: lightColors})};
});
jest.mock('@react-native-community/datetimepicker', () => {
  const ReactModule = jest.requireActual('react');
  const {View} = jest.requireActual('react-native');
  return function Picker(props: object) {
    return ReactModule.createElement(View, props);
  };
});

import LeaveEditor from '../src/components/entries/LeaveEditor';
import {
  createLeaveRange,
  deleteLeaveRange,
  getLeaveRange,
  updateLeaveRange,
} from '../src/db/leaveRanges';

const mockCreateLeaveRange = createLeaveRange as jest.MockedFunction<typeof createLeaveRange>;
const mockUpdateLeaveRange = updateLeaveRange as jest.MockedFunction<typeof updateLeaveRange>;
const mockDeleteLeaveRange = deleteLeaveRange as jest.MockedFunction<typeof deleteLeaveRange>;
const mockGetLeaveRange = getLeaveRange as jest.MockedFunction<typeof getLeaveRange>;

const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function button(root: ReactTestInstance, label: string): ReactTestInstance {
  return root.findAllByType(TouchableOpacity).find(
    item => item.props.accessibilityLabel === label,
  )!;
}

async function render(
  props: Partial<React.ComponentProps<typeof LeaveEditor>> = {},
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <LeaveEditor
        initialDate="2026-08-03"
        onSaved={jest.fn()}
        {...props}
      />,
    );
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  const range = {
    id: 1,
    type: 'paid_day_off' as const,
    start_date: '2026-08-03',
    end_date: '2026-08-03',
    created_at: '',
    updated_at: '',
  };
  mockCreateLeaveRange.mockResolvedValue(range);
  mockUpdateLeaveRange.mockResolvedValue(range);
  mockDeleteLeaveRange.mockResolvedValue(undefined);
  mockGetLeaveRange.mockResolvedValue(null);
});

it('creates an inclusive vacation range', async () => {
  const onSaved = jest.fn();
  const renderer = await render({onSaved});

  act(() => button(renderer.root, 'Vacation').props.onPress());
  act(() => button(renderer.root, 'End date').props.onPress());
  act(() => renderer.root.findByProps({testID: 'leave-date-picker'}).props.onChange(
    {type: 'set'},
    new Date(2026, 7, 7, 12),
  ));
  await act(async () => button(renderer.root, 'Save').props.onPress());

  expect(mockCreateLeaveRange).toHaveBeenCalledWith({
    type: 'vacation',
    startDate: '2026-08-03',
    endDate: '2026-08-07',
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it('loads and updates the whole existing range', async () => {
  mockGetLeaveRange.mockResolvedValue({
    id: 9,
    type: 'sick',
    start_date: '2026-08-05',
    end_date: '2026-08-06',
    created_at: '',
    updated_at: '',
  });
  const renderer = await render({leaveRangeId: 9});

  await act(async () => button(renderer.root, 'Update').props.onPress());

  expect(mockUpdateLeaveRange).toHaveBeenCalledWith(9, {
    type: 'sick',
    startDate: '2026-08-05',
    endDate: '2026-08-06',
  });
});

it('keeps the editor open and localizes overlap errors', async () => {
  const onSaved = jest.fn();
  mockCreateLeaveRange.mockRejectedValue(new Error('leave_overlap'));
  const renderer = await render({onSaved});

  await act(async () => button(renderer.root, 'Save').props.onPress());

  expect(alert).toHaveBeenCalledWith(
    'Error',
    'This leave overlaps an incompatible leave period.',
  );
  expect(onSaved).not.toHaveBeenCalled();
});
