jest.mock('../src/store/dayStore', () => ({
  useDayStore: {getState: () => ({loadToday: jest.fn(async () => ({id: 42, date: '2026-08-06'}))})},
}));
let mockReady = true;
jest.mock('../src/navigation/navigationRef', () => ({
  navigationRef: {isReady: () => mockReady, navigate: jest.fn()},
}));

import {parseDeepLink, handleDeepLink, flushPendingDeepLink} from '../src/services/deepLinks';
import {navigationRef} from '../src/navigation/navigationRef';

describe('parseDeepLink', () => {
  it('parses the three quickadd types', () => {
    expect(parseDeepLink('kelomit://quickadd/note')).toEqual({entryType: 'note'});
    expect(parseDeepLink('kelomit://quickadd/photo')).toEqual({entryType: 'photo'});
    expect(parseDeepLink('kelomit://quickadd/voice')).toEqual({entryType: 'voice'});
  });
  it('rejects junk', () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('kelomit://quickadd/video')).toBeNull();
    expect(parseDeepLink('kelomit://other/note')).toBeNull();
    expect(parseDeepLink('https://quickadd/note')).toBeNull();
  });
});

describe('handleDeepLink', () => {
  beforeEach(() => {
    mockReady = true;
    (navigationRef.navigate as jest.Mock).mockClear();
  });

  it('resolves today and navigates with autoCapture', async () => {
    await handleDeepLink('kelomit://quickadd/photo');
    expect(navigationRef.navigate).toHaveBeenCalledWith('QuickAddModal', {
      dayId: 42,
      entryType: 'photo',
      autoCapture: true,
    });
  });
  it('does nothing on junk', async () => {
    await handleDeepLink('kelomit://nope');
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });
});

describe('cold-start replay', () => {
  beforeEach(() => {
    mockReady = true;
    (navigationRef.navigate as jest.Mock).mockClear();
  });

  it('stashes the url when nav is not ready, then replays it once nav is ready', async () => {
    mockReady = false;
    await handleDeepLink('kelomit://quickadd/voice');
    expect(navigationRef.navigate).not.toHaveBeenCalled();

    mockReady = true;
    flushPendingDeepLink();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));

    expect(navigationRef.navigate).toHaveBeenCalledTimes(1);
    expect(navigationRef.navigate).toHaveBeenCalledWith('QuickAddModal', {
      dayId: 42,
      entryType: 'voice',
      autoCapture: true,
    });
  });

  it('consumes the pending url, so a second flush does not navigate again', async () => {
    mockReady = false;
    await handleDeepLink('kelomit://quickadd/note');
    mockReady = true;
    flushPendingDeepLink();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    expect(navigationRef.navigate).toHaveBeenCalledTimes(1);

    flushPendingDeepLink();
    await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    expect(navigationRef.navigate).toHaveBeenCalledTimes(1);
  });
});
