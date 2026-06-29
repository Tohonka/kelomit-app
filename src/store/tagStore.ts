import {create} from 'zustand';
import {
  getAllTags,
  getOrCreateTag,
  renameTag,
  mergeTags,
  deleteTag,
} from '../db/tags';
import {useEntryStore} from './entryStore';
import type {Tag} from '../types';

interface TagState {
  tags: Tag[];
  loaded: boolean;
  load: () => Promise<void>;
  getOrCreate: (name: string) => Promise<Tag>;
  rename: (id: number, name: string) => Promise<void>;
  merge: (keepId: number, dropId: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
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
      set(state => ({tags: [...state.tags, tag].sort((a, b) => a.name.localeCompare(b.name))}));
    }
    return tag;
  },

  rename: async (id, name) => {
    await renameTag(id, name);
    const normalized = name.trim().toLowerCase();
    set(state => ({
      tags: state.tags
        .map(t => (t.id === id ? {...t, name: normalized} : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    useEntryStore.getState().reset();
  },

  merge: async (keepId, dropId) => {
    await mergeTags(keepId, dropId);
    set(state => ({tags: state.tags.filter(t => t.id !== dropId)}));
    useEntryStore.getState().reset();
  },

  remove: async (id) => {
    await deleteTag(id);
    set(state => ({tags: state.tags.filter(t => t.id !== id)}));
    useEntryStore.getState().reset();
  },
}));
