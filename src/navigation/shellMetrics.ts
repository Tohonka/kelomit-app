import {useSafeAreaInsets} from 'react-native-safe-area-context';

// Heights the two floating nav bars occupy, measured below the safe-area insets.
// Screens add these to their scroll content so nothing hides under a bar.
export const TOP_BAR_HEIGHT = 88; // status-bar inset + circle row
export const BOTTOM_PILL_HEIGHT = 86; // floaty pill + its bottom offset

/** Content padding that clears the top feature bar and the bottom pill. */
export function useShellPadding() {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + TOP_BAR_HEIGHT,
    paddingBottom: insets.bottom + BOTTOM_PILL_HEIGHT,
  };
}
