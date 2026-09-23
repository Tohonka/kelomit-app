import {contextBridge, ipcRenderer} from 'electron';
import type {PairInfo} from '../main/config.ts';
import type {MenuAction} from '../main/menu.ts';
import type {QueryArgs, QueryName, QueryResult} from '../main/queries.ts';

/** Everything the renderer may ask the main process. Typed once, here. */
export interface CompanionApi {
  pairInfo(): Promise<PairInfo>;
  /** A named read of the last pushed database; null before the first push. */
  query<N extends QueryName>(name: N, ...args: QueryArgs<N>): Promise<QueryResult<N> | null>;
  onMenu(handler: (action: MenuAction) => void): () => void;
  /** The phone pushed a new database. */
  onDbChanged(handler: () => void): () => void;
}

function on(channel: string, handler: (...args: any[]) => void): () => void {
  const listener = (_e: unknown, ...args: unknown[]) => handler(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: CompanionApi = {
  pairInfo: () => ipcRenderer.invoke('pair-info'),
  query: (name, ...args) => ipcRenderer.invoke('query', name, ...args),
  onMenu: handler => on('menu', handler),
  onDbChanged: handler => on('db-changed', handler),
};

contextBridge.exposeInMainWorld('kelomit', api);
