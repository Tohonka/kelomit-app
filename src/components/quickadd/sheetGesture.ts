// Pure decision for the Quick Add sheet pan-gesture release.
// translationY > 0 means dragged downward. Dismiss if past 1/3 of the sheet
// height, or on a fast downward fling. Upward drags never dismiss.
//
// Marked a worklet: it is called from Gesture.Pan().onEnd, which runs on the UI
// thread. Calling a non-worklet from there crashes — and since any tap is a pan
// begin+end, it crashed on first touch. The 'worklet' directive is a harmless
// no-op when the function is called directly from JS (e.g. the unit tests).
export function shouldDismiss(
  translationY: number,
  velocityY: number,
  sheetHeight: number,
): boolean {
  'worklet';
  const FLING_VELOCITY = 800;
  if (translationY <= 0) {
    return false;
  }
  return translationY > sheetHeight / 3 || velocityY > FLING_VELOCITY;
}
