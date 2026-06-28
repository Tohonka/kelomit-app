import {useEffect, useState} from 'react';
import {Keyboard} from 'react-native';

/**
 * Current on-screen keyboard height in px (0 when hidden). Use it to pad a
 * scroll view with a "runway" (`paddingBottom: kbHeight`) so a focused field
 * near the bottom can scroll above the keyboard — Android's adjustResize alone
 * doesn't lift it. Mirrors the inline pattern in AddEntryModal.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
