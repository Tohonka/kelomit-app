/** Saved top-bar order → the order to render: saved routes that still exist,
 *  then any feature added since (new features append at the end). */
export function applyFeatureOrder(saved: string[] | null, routes: string[]): string[] {
  const known = (saved ?? []).filter((r, i, all) => routes.includes(r) && all.indexOf(r) === i);
  return [...known, ...routes.filter(r => !known.includes(r))];
}

export function parseFeatureOrder(raw: string | null): string[] | null {
  if (!raw) { return null; }
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.every(x => typeof x === 'string') ? v : null;
  } catch {
    return null;
  }
}

/** `list` with the item at `from` re-inserted at `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Grid cell under a point (cell centres snap), clamped to the last item. */
export function cellIndexAt(x: number, y: number, cellW: number, cellH: number, cols: number, count: number): number {
  const col = Math.max(0, Math.min(cols - 1, Math.round(x / cellW)));
  const row = Math.max(0, Math.round(y / cellH));
  return Math.max(0, Math.min(count - 1, row * cols + col));
}
