import {contextBridge, ipcRenderer} from 'electron';
import type {PairInfo} from '../main/config.ts';
import type {MenuAction} from '../main/menu.ts';

/** Everything the renderer may ask the main process. Typed once, here. */
export interface CompanionApi {
  pairInfo(): Promise<PairInfo>;
  onMenu(handler: (action: MenuAction) => void): () => void;
}

const api: CompanionApi = {
  pairInfo: () => ipcRenderer.invoke('pair-info'),
  onMenu: handler => {
    const listener = (_e: unknown, action: MenuAction) => handler(action);
    ipcRenderer.on('menu', listener);
    return () => {
      ipcRenderer.removeListener('menu', listener);
    };
  },
};

contextBridge.exposeInMainWorld('kelomit', api);
