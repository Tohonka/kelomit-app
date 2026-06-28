// Pure decision for the Quick Add sheet pan-gesture release.
// translationY > 0 means dragged downward. Dismiss if past 1/3 of the sheet
// height, or on a fast downward fling. Upward drags never dismiss.
const FLING_VELOCITY = 800;

export function shouldDismiss(
  translationY: number,
  velocityY: number,
  sheetHeight: number,
): boolean {
  if (translationY <= 0) {
    return false;
  }
  return translationY > sheetHeight / 3 || velocityY > FLING_VELOCITY;
}
