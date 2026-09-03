import {Vibration} from 'react-native';

// Centralized feedback patterns (spec "Bold & Tactile"). Patterns are
// Android Vibration arrays: [delay, on, off, on, ...]. Single number = one buzz.
// Tiers follow the weight of the action ("majority" rule): a tap is a tick,
// something starting is a pulse, a save is a double-tap, destructive is long.
export const HAPTIC_TAP = 12;               // light tick: any button press
export const HAPTIC_START = 40;             // something began (timer start, toggle done)
export const HAPTIC_SAVE = [0, 35, 15, 55]; // short double-tap on save
export const HAPTIC_CANCEL = [0, 90];       // one longer buzz for cancel/delete

// ponytail: RN Vibration, not performHapticFeedback — swap to a 20-line native
// module (WorkReportModule.kt pattern) only if the 12 ms tick feels like a buzz.
export function haptic(pattern: number | number[]): void {
  Vibration.vibrate(pattern);
}
