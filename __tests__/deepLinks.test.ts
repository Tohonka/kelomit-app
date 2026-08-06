jest.mock('../src/db/days', () => ({
  getOrCreateDay: jest.fn(async () => ({id: 42, date: '2026-08-06'})),
}));
jest.mock('../src/navigation/navigationRef', () => ({
  navigationRef: {isReady: () => true, navigate: jest.fn()},
}));

import {parseDeepLink, handleDeepLink} from '../src/services/deepLinks';
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
  it('resolves today and navigates with autoCapture', async () => {
    await handleDeepLink('kelomit://quickadd/photo');
    expect(navigationRef.navigate).toHaveBeenCalledWith('QuickAddModal', {
      dayId: 42,
      entryType: 'photo',
      autoCapture: true,
    });
  });
  it('does nothing on junk', async () => {
    (navigationRef.navigate as jest.Mock).mockClear();
    await handleDeepLink('kelomit://nope');
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });
});
