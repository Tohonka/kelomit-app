import {selectProvider} from '../src/services/transcription/selectProvider';

describe('selectProvider', () => {
  it('defaults to ondevice when unset', () => {
    expect(selectProvider(null)).toBe('ondevice');
    expect(selectProvider('')).toBe('ondevice');
  });
  it('returns api when set to api', () => expect(selectProvider('api')).toBe('api'));
  it('returns ondevice when set to ondevice', () => expect(selectProvider('ondevice')).toBe('ondevice'));
  it('falls back to ondevice for garbage', () => expect(selectProvider('nope')).toBe('ondevice'));
});
