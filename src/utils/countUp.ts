// Pure mapping from animation progress (0..1) to a displayed integer.
export function countUpValue(progress: number, target: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return Math.round(p * target);
}
