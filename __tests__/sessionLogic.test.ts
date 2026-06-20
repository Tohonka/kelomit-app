import {elapsedSeconds, sessionToEntryParams} from '../src/services/sessionLogic';
import type {ActiveSession} from '../src/types';

const baseSession: ActiveSession = {
  started_at: '2026-06-21T08:00:00.000Z',
  project_id: 7,
  activity_type: 'work',
  tags: ['Quick add'],
  title: 'Roof repair',
  source: 'timer',
};

describe('elapsedSeconds', () => {
  it('counts whole seconds since the start', () => {
    const now = new Date('2026-06-21T08:01:30.000Z'); // +90s
    expect(elapsedSeconds(baseSession.started_at, now)).toBe(90);
  });

  it('never returns a negative value for a future start', () => {
    const now = new Date('2026-06-21T07:59:00.000Z'); // before start
    expect(elapsedSeconds(baseSession.started_at, now)).toBe(0);
  });

  it('floors partial seconds', () => {
    const now = new Date('2026-06-21T08:00:01.900Z'); // +1.9s
    expect(elapsedSeconds(baseSession.started_at, now)).toBe(1);
  });
});

describe('sessionToEntryParams', () => {
  it('produces a note entry with duration and the timed span', () => {
    const endedAt = new Date('2026-06-21T09:30:00.000Z'); // +1h30m
    const params = sessionToEntryParams({
      session: baseSession,
      dayId: 42,
      endedAt,
      tagIds: [3],
      latitude: 60.1,
      longitude: 24.9,
    });

    expect(params).toMatchObject({
      day_id: 42,
      entry_type: 'note',
      activity_type: 'work',
      project_id: 7,
      title: 'Roof repair',
      duration_sec: 5400,
      time_from: baseSession.started_at,
      time_to: endedAt.toISOString(),
      latitude: 60.1,
      longitude: 24.9,
      tagIds: [3],
    });
  });

  it('defaults location to null when no fix is available', () => {
    const params = sessionToEntryParams({
      session: {...baseSession, project_id: null, title: null},
      dayId: 1,
      endedAt: new Date('2026-06-21T08:05:00.000Z'),
      tagIds: [],
    });
    expect(params.latitude).toBeNull();
    expect(params.longitude).toBeNull();
    expect(params.project_id).toBeNull();
    expect(params.title).toBeNull();
    expect(params.duration_sec).toBe(300);
  });
});
