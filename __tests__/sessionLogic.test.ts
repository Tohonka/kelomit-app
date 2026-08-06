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
  it('produces a note entry with the from–to span and no bare duration', () => {
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
      // from–to is the source of truth; duration is derivable from it.
      duration_sec: null,
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
    expect(params.duration_sec).toBeNull();
    expect(params.time_from).toBe(baseSession.started_at);
    expect(params.time_to).toBe('2026-06-21T08:05:00.000Z');
  });
});

import {sessionElapsedMs, formatTimerTitle} from '../src/services/sessionLogic';

const base: ActiveSession = {
  started_at: '2026-08-06T10:00:00.000Z',
  project_id: 1, activity_type: 'work', tags: [], title: null, source: 'widget',
};

describe('sessionElapsedMs', () => {
  const now = new Date('2026-08-06T10:10:00.000Z');
  it('running, no history: elapsed since start', () => {
    expect(sessionElapsedMs(base, now)).toBe(10 * 60_000);
  });
  it('running with accumulated segments adds them', () => {
    expect(sessionElapsedMs({...base, accumulated_ms: 5 * 60_000}, now)).toBe(15 * 60_000);
  });
  it('paused: accumulated only, running segment ignored', () => {
    expect(
      sessionElapsedMs({...base, accumulated_ms: 5 * 60_000, paused_at: '2026-08-06T10:05:00.000Z'}, now),
    ).toBe(5 * 60_000);
  });
  it('old persisted session without new fields still works', () => {
    expect(sessionElapsedMs({...base}, now)).toBe(10 * 60_000);
  });
});

describe('formatTimerTitle', () => {
  it('name + tally', () => {
    expect(formatTimerTitle({name: 'Banana', projectName: 'Banana proj', tally: 3, timeLabel: '14:30'}))
      .toBe('Banana #3');
  });
  it('falls back to project name', () => {
    expect(formatTimerTitle({name: null, projectName: 'Banana', tally: 3, timeLabel: '14:30'}))
      .toBe('Banana #3');
  });
  it('name without project/tally gets the time', () => {
    expect(formatTimerTitle({name: 'Eating', projectName: null, tally: null, timeLabel: '14:30'}))
      .toBe('Eating 14:30');
  });
  it('nothing to build from → null', () => {
    expect(formatTimerTitle({name: null, projectName: null, tally: null, timeLabel: '14:30'}))
      .toBeNull();
  });
});
