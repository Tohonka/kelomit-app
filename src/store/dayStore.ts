import {create} from 'zustand';
import {format} from 'date-fns';
import {getOrCreateDay, getDayByDate, updateDay, type DayPrefill} from '../db/days';
import {useSettingsStore} from './settingsStore';
import {hhmmToIsoOn} from '../utils/dateUtils';
import {usualHoursForDate} from '../utils/usualHours';
import type {Day} from '../types';

type DayTimeFields = Partial<Pick<Day,
  'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2' | 'started_at_source' | 'ended_at_source' | 'notes'
>>;

/** Prefill params for a brand-new day, when the user has opted in and set both
 *  usual times. Only used for *today* — seeding a past/future day just by
 *  opening it in the calendar would fabricate hours. See Iteration 3 Phase 4.1. */
function prefillFor(date: string): DayPrefill | undefined {
  const s = useSettingsStore.getState();
  if (!s.prefill_from_usual) {
    return undefined;
  }
  // Resolve the weekday's hours: a custom override, a day off (→ no prefill), or
  // the default. See usualHours.ts.
  const {start, end} = usualHoursForDate(date, s.usual_start, s.usual_end, s.weekday_hours);
  if (!start || !end) {
    return undefined;
  }
  return {
    started_at: hhmmToIsoOn(date, start),
    ended_at: hhmmToIsoOn(date, end),
  };
}

interface DayState {
  today: Day | null;
  selectedDay: Day | null;
  daysCache: Record<string, Day>;
  isLoading: boolean;
  error: string | null;
  loadToday: () => Promise<Day>;
  loadDay: (date: string, options?: {refresh?: boolean}) => Promise<Day>;
  updateDayTimes: (date: string, fields: DayTimeFields) => Promise<void>;
}

export const useDayStore = create<DayState>((set, get) => ({
  today: null,
  selectedDay: null,
  daysCache: {},
  isLoading: false,
  error: null,

  loadToday: async () => {
    const todayDate = format(new Date(), 'yyyy-MM-dd');
    set({isLoading: true, error: null});
    try {
      const day = await getOrCreateDay(todayDate, prefillFor(todayDate));
      set(state => ({
        today: day,
        daysCache: {...state.daysCache, [todayDate]: day},
        isLoading: false,
      }));
      return day;
    } catch (e) {
      set({error: String(e), isLoading: false});
      throw e;
    }
  },

  loadDay: async (date: string, options?: {refresh?: boolean}) => {
    if (!options?.refresh) {
      const cached = get().daysCache[date];
      if (cached) {
        set({selectedDay: cached});
        return cached;
      }
    }
    let day = options?.refresh ? await getDayByDate(date) : null;
    if (!day) {
      day = await getOrCreateDay(date);
    }
    set(state => ({
      selectedDay: day,
      today: state.today?.date === date ? day : state.today,
      daysCache: {...state.daysCache, [date]: day},
    }));
    return day;
  },

  updateDayTimes: async (date, fields) => {
    const existing = get().daysCache[date];
    if (!existing) { return; }
    const stamped = {...fields};
    if ('started_at' in fields) {
      stamped.started_at_source = 'manual';
    }
    if ('ended_at' in fields) {
      stamped.ended_at_source = 'manual';
    }
    await updateDay(existing.id, stamped);
    const updated = await getDayByDate(date);
    if (!updated) { return; }
    set(state => ({
      daysCache: {...state.daysCache, [date]: updated},
      today: state.today?.date === date ? updated : state.today,
      selectedDay: state.selectedDay?.date === date ? updated : state.selectedDay,
    }));
  },
}));
