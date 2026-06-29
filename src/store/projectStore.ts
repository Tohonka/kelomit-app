import {create} from 'zustand';
import {
  getAllProjects,
  createProject,
  archiveProject,
  unarchiveProject,
  renameProject,
  mergeProjects,
  deleteProject,
} from '../db/projects';
import {useEntryStore} from './entryStore';
import type {Project} from '../types';

interface ProjectState {
  projects: Project[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (name: string, type: Project['type']) => Promise<Project>;
  archive: (id: number) => Promise<void>;
  unarchive: (id: number) => Promise<void>;
  rename: (id: number, name: string) => Promise<void>;
  merge: (keepId: number, dropId: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  loaded: false,

  load: async () => {
    const projects = await getAllProjects(true);
    set({projects, loaded: true});
  },

  add: async (name, type) => {
    const project = await createProject(name, type);
    set(state => ({projects: [...state.projects, project]}));
    return project;
  },

  archive: async (id) => {
    await archiveProject(id);
    set(state => ({
      projects: state.projects.map(p =>
        p.id === id ? {...p, archived: true} : p,
      ),
    }));
  },

  unarchive: async (id) => {
    await unarchiveProject(id);
    set(state => ({
      projects: state.projects.map(p =>
        p.id === id ? {...p, archived: false} : p,
      ),
    }));
  },

  rename: async (id, name) => {
    await renameProject(id, name);
    const trimmed = name.trim();
    set(state => ({
      projects: state.projects.map(p => (p.id === id ? {...p, name: trimmed} : p)),
    }));
    useEntryStore.getState().reset();
  },

  merge: async (keepId, dropId) => {
    await mergeProjects(keepId, dropId);
    set(state => ({projects: state.projects.filter(p => p.id !== dropId)}));
    useEntryStore.getState().reset();
  },

  remove: async (id) => {
    await deleteProject(id);
    set(state => ({projects: state.projects.filter(p => p.id !== id)}));
    useEntryStore.getState().reset();
  },
}));
