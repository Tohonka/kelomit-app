import {shouldDismiss} from '../src/components/quickadd/sheetGesture';

const H = 600;

describe('shouldDismiss', () => {
  it('dismisses when dragged past one third', () => {
    expect(shouldDismiss(H / 3 + 1, 0, H)).toBe(true);
  });
  it('stays open when dragged less than one third slowly', () => {
    expect(shouldDismiss(H / 3 - 1, 0, H)).toBe(false);
  });
  it('dismisses on a fast downward fling even if short', () => {
    expect(shouldDismiss(40, 900, H)).toBe(true);
  });
  it('never dismisses on upward drag', () => {
    expect(shouldDismiss(-300, -2000, H)).toBe(false);
  });
});
