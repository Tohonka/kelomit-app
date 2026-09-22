import type {Entry} from '../types';

export interface SubnoteSpanCheck {
  /** Subnote starts before the parent: the parent would need this new start. */
  moveParentFrom?: string;
  /** Subnote ends after the parent's set end: the parent would need this new end. */
  moveParentTo?: string;
  /** Duration-type subnote is longer than the parent's known length (seconds). */
  tooLong?: number;
}

/** Parent length in seconds, or null when it can't be known (no end yet). */
export function parentLengthSec(parent: Pick<Entry, 'duration_sec' | 'time_from' | 'time_to'>): number | null {
  if (parent.duration_sec != null) { return parent.duration_sec; }
  if (parent.time_from && parent.time_to) {
    return Math.max(0, (Date.parse(parent.time_to) - Date.parse(parent.time_from)) / 1000);
  }
  return null;
}

/**
 * A subnote lives inside its parent's time. Start/end moves are only proposed
 * for a from–to parent (a duration parent keeps its own length); the length
 * cap applies to any parent with a known length. Returns {} when all is fine.
 */
export function checkSubnoteSpan(
  parent: Pick<Entry, 'duration_sec' | 'time_from' | 'time_to'>,
  from: string | null,
  to: string | null,
  durationSec: number | null,
): SubnoteSpanCheck {
  const out: SubnoteSpanCheck = {};
  const len = parentLengthSec(parent);
  if (durationSec != null && len != null && durationSec > len) {
    out.tooLong = len;
    return out;
  }
  const rangeParent = parent.duration_sec == null && !!parent.time_from;
  if (!rangeParent) { return out; }
  if (from && parent.time_from && Date.parse(from) < Date.parse(parent.time_from)) {
    out.moveParentFrom = from;
  }
  if (to && parent.time_to && Date.parse(to) > Date.parse(parent.time_to)) {
    out.moveParentTo = to;
  }
  return out;
}
