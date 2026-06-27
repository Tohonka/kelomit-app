import {Vibration} from 'react-native';
import {haptic, HAPTIC_SAVE, HAPTIC_START, HAPTIC_CANCEL} from '../src/utils/haptics';

describe('haptics', () => {
  it('exposes the spec patterns', () => {
    expect(HAPTIC_SAVE).toEqual([0, 35, 15, 55]);
    expect(HAPTIC_START).toBe(40);
    expect(HAPTIC_CANCEL).toEqual([0, 90]);
  });

  it('forwards the pattern to Vibration.vibrate', () => {
    const spy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    haptic(HAPTIC_SAVE);
    expect(spy).toHaveBeenCalledWith([0, 35, 15, 55]);
    spy.mockRestore();
  });
});
