import {progressPct} from '../src/services/transcription/modelManager';

describe('progressPct', () => {
  it('is 0 when nothing written', () => expect(progressPct(0, 100)).toBe(0));
  it('rounds to a percent', () => expect(progressPct(50, 200)).toBe(25));
  it('caps at 100', () => expect(progressPct(300, 200)).toBe(100));
  it('is 0 when total is unknown (0)', () => expect(progressPct(10, 0)).toBe(0));
});
