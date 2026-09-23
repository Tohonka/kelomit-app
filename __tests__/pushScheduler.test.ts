import {
  PushScheduler,
  CONTENT_DEBOUNCE_MS,
  NOISY_DEBOUNCE_MS,
  FAIL_BACKOFF_BASE_MS,
  FAIL_BACKOFF_MAX_MS,
  debounceFor,
  failBackoff,
} from '../src/services/companion/pushScheduler';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const flush = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  // let the push promise chain settle
  await Promise.resolve();
  await Promise.resolve();
};

describe('debounceFor', () => {
  it('classifies tables', () => {
    expect(debounceFor('entries')).toBe(CONTENT_DEBOUNCE_MS);
    expect(debounceFor('gps_track')).toBe(NOISY_DEBOUNCE_MS);
    expect(debounceFor('diag_log')).toBeNull();
  });
});

describe('failBackoff', () => {
  it('doubles from 30 s and caps at 5 min', () => {
    expect(failBackoff(1)).toBe(FAIL_BACKOFF_BASE_MS);
    expect(failBackoff(2)).toBe(2 * FAIL_BACKOFF_BASE_MS);
    expect(failBackoff(10)).toBe(FAIL_BACKOFF_MAX_MS);
  });
});

describe('PushScheduler', () => {
  it('coalesces a burst of content writes into one push after 1.5 s', async () => {
    const push = jest.fn(() => Promise.resolve('done' as const));
    const s = new PushScheduler(push);
    s.notify('entries');
    s.notify('entry_tags');
    s.notify('entries');
    await flush(CONTENT_DEBOUNCE_MS - 1);
    expect(push).not.toHaveBeenCalled();
    await flush(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('a content write does not wait behind a noisy one', async () => {
    const push = jest.fn(() => Promise.resolve('done' as const));
    const s = new PushScheduler(push);
    s.notify('gps_track');
    s.notify('entries');
    await flush(CONTENT_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('noisy-only writes push at most every 30 s', async () => {
    const push = jest.fn(() => Promise.resolve('done' as const));
    const s = new PushScheduler(push);
    for (let i = 0; i < 10; i++) {
      s.notify('gps_track');
      await flush(4000);
    }
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('diag_log never triggers a push', async () => {
    const push = jest.fn(() => Promise.resolve('done' as const));
    const s = new PushScheduler(push);
    s.notify('diag_log');
    await flush(NOISY_DEBOUNCE_MS * 2);
    expect(push).not.toHaveBeenCalled();
  });

  it('a write during a push schedules exactly one follow-up', async () => {
    let resolve!: (v: 'done') => void;
    const push = jest.fn(
      () =>
        new Promise<'done'>(r => {
          resolve = r;
        }),
    );
    const s = new PushScheduler(push);
    s.notify('entries');
    await flush(CONTENT_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);
    s.notify('entries');
    s.notify('days');
    resolve('done');
    await flush(0);
    await flush(CONTENT_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('backs off after failures and kick() resets it', async () => {
    const push = jest.fn(() => Promise.resolve('failed' as const));
    const s = new PushScheduler(push);
    s.notify('entries');
    await flush(CONTENT_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);
    s.notify('entries');
    await flush(CONTENT_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1); // held back by the 30 s backoff
    await flush(FAIL_BACKOFF_BASE_MS);
    expect(push).toHaveBeenCalledTimes(2);
    s.notify('entries');
    s.kick();
    await flush(0);
    expect(push).toHaveBeenCalledTimes(3);
  });
});
