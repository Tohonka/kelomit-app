import {create} from 'zustand';
import {getAllTags, getOrCreateTag} from '../db/tags';
import type {Tag} from '../types';

interface TagState {
  tags: Tag[];
  loaded: boolean;
  load: () => Promise<void>;
  getOrCreate: (name: string) => Promise<Tag>;
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  loaded: false,

  load: async () => {
    const tags = await getAllTags();
    set({tags, loaded: true});
  },

  getOrCreate: async (name: string) => {
    const tag = await getOrCreateTag(name);
    const existing = get().tags.find(t => t.id === tag.id);
    if (!existing) {
      set(state => ({tags: [...state.tags, tag]}));
    }
    return tag;
  },
}));
