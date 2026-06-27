import {Vibration} from 'react-native';

// Centralized feedback patterns (spec "Bold & Tactile"). Patterns are
// Android Vibration arrays: [delay, on, off, on, ...]. Single number = one buzz.
export const HAPTIC_SAVE = [0, 35, 15, 55]; // short double-tap on save
export const HAPTIC_START = 40;             // single pulse on timer start
export const HAPTIC_CANCEL = [0, 90];       // one longer buzz for cancel/delete

export function haptic(pattern: number | number[]): void {
  Vibration.vibrate(pattern);
}
