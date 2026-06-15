// Warm, slightly retro palette shared by Insights bars and the day-split bar.
export const CHART_PALETTE = [
  '#E8804D',
  '#E6A23C',
  '#D9646B',
  '#7B8CDE',
  '#5BA88F',
  '#C77DBB',
  '#B59B6A',
  '#8AA85B',
];

export function chartColorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
