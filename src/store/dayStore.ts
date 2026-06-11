import {create} from 'zustand';
import {format} from 'date-fns';
import {getOrCreateDay, getDayByDate, updateDay} from '../db/days';
import type {Day} from '../types';

type DayTimeFields = Partial<Pick<Day,
  'started_at' | 'ended_at' | 'started_at_2' | 'ended_at_2'
>>;

interface DayState {
  today: Day | null;
  selectedDay: Day | null;
  daysCache: Record<string, Day>;
  isLoading: boolean;
  error: string | null;
  loadToday: () => Promise<void>;
  loadDay: (date: string) => Promise<Day>;
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
      const day = await getOrCreateDay(todayDate);
      set(state => ({
        today: day,
        daysCache: {...state.daysCache, [todayDate]: day},
        isLoading: false,
      }));
    } catch (e) {
      set({error: String(e), isLoading: false});
    }
  },

  loadDay: async (date: string) => {
    const cached = get().daysCache[date];
    if (cached) {
      set({selectedDay: cached});
      return cached;
    }
    const day = await getOrCreateDay(date);
    set(state => ({
      selectedDay: day,
      daysCache: {...state.daysCache, [date]: day},
    }));
    return day;
  },

  updateDayTimes: async (date, fields) => {
    const existing = get().daysCache[date];
    if (!existing) { return; }
    await updateDay(existing.id, fields);
    const updated = await getDayByDate(date);
    if (!updated) { return; }
    set(state => ({
      daysCache: {...state.daysCache, [date]: updated},
      today: state.today?.date === date ? updated : state.today,
      selectedDay: state.selectedDay?.date === date ? updated : state.selectedDay,
    }));
  },
}));
