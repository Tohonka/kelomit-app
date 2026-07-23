import {create} from 'zustand';
import {
  getLocations,
  createLocation,
  deleteLocation,
  updateLocationRadius,
  clampRadius,
  type CreateLocationParams,
} from '../db/locations';
import {syncSavedPlaces} from '../services/trackingOrchestrator';
import type {SavedLocation} from '../types';

interface LocationState {
  locations: SavedLocation[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (params: CreateLocationParams) => Promise<SavedLocation>;
  remove: (id: number) => Promise<void>;
  setRadius: (id: number, radiusM: number) => Promise<void>;
}

export const useLocationStore = create<LocationState>(set => ({
  locations: [],
  loaded: false,

  load: async () => {
    const locations = await getLocations();
    set({locations, loaded: true});
  },

  add: async params => {
    const loc = await createLocation(params);
    set(state => ({locations: [...state.locations, loc]}));
    await syncSavedPlaces(await getLocations());
    return loc;
  },

  remove: async id => {
    await deleteLocation(id);
    set(state => ({locations: state.locations.filter(l => l.id !== id)}));
    await syncSavedPlaces(await getLocations());
  },

  setRadius: async (id, radiusM) => {
    const clamped = clampRadius(radiusM);
    await updateLocationRadius(id, clamped);
    set(state => ({
      locations: state.locations.map(l =>
        l.id === id ? {...l, radius_m: clamped} : l,
      ),
    }));
    await syncSavedPlaces(await getLocations());
  },
}));
