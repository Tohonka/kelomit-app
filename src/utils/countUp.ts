// Pure mapping from animation progress (0..1) to a displayed integer.
// Marked as a worklet: CountUp calls it from a useAnimatedReaction worklet on
// the UI thread, which crashes under reanimated 4.x without this directive.
// The 'worklet' string is a no-op in plain JS, so the Jest test still runs it.
export function countUpValue(progress: number, target: number): number {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  return Math.round(p * target);
}
