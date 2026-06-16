import {create} from 'zustand';
import {
  getLocations,
  createLocation,
  deleteLocation,
  type CreateLocationParams,
} from '../db/locations';
import {refreshGeofences} from '../services/gpsService';
import type {SavedLocation} from '../types';

interface LocationState {
  locations: SavedLocation[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (params: CreateLocationParams) => Promise<SavedLocation>;
  remove: (id: number) => Promise<void>;
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
    await refreshGeofences();
    return loc;
  },

  remove: async id => {
    await deleteLocation(id);
    set(state => ({locations: state.locations.filter(l => l.id !== id)}));
    await refreshGeofences();
  },
}));
