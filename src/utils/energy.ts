/*
 * Rough energy expenditure from the movement trail (plan 2026-09-14, research
 * native-libs.md §4): kcal = MET × kg × hours, MET from the 2024 Adult
 * Compendium by speed band. Vehicle and still legs count nothing. The result
 * is ±20% at best, so it is rounded to 50 kcal and always labelled an
 * estimate. Never add it on top of Health Connect's own calorie figures.
 */

export type MoveMode = 'foot' | 'cycle';

export function metFor(mode: MoveMode, kmh: number): number {
  if (mode === 'foot') {
    if (kmh < 3.2) { return 2.3; }
    if (kmh < 4.5) { return 2.8; }
    if (kmh < 5.6) { return 3.8; }
    if (kmh < 6.4) { return 4.8; }
    if (kmh < 8) { return 5.5; }
    return 8.0; // on-foot faster than a brisk walk = jogging
  }
  if (kmh < 16) { return 4.0; }
  if (kmh < 19) { return 6.8; }
  if (kmh < 22.5) { return 8.0; }
  return 10.0;
}

export interface MovementInput {
  footSec: number;
  footM: number;
  cycleSec: number;
  cycleM: number;
}

/** Estimated kcal for walking + cycling, rounded to the nearest 50. */
export function movementKcal(m: MovementInput, weightKg: number): number {
  let kcal = 0;
  const legs: [MoveMode, number, number][] = [['foot', m.footSec, m.footM], ['cycle', m.cycleSec, m.cycleM]];
  for (const [mode, sec, meters] of legs) {
    if (sec <= 0) { continue; }
    const hours = sec / 3600;
    const kmh = meters / 1000 / hours;
    kcal += metFor(mode, kmh) * weightKg * hours;
  }
  return Math.round(kcal / 50) * 50;
}
