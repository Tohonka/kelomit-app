import {contextBridge, ipcRenderer, webUtils} from 'electron';
import type {PairInfo} from '../main/config.ts';
import type {MenuAction} from '../main/menu.ts';
import type {QueryArgs, QueryName, QueryResult} from '../main/queries.ts';
import type {PhoneState} from '../main/ws.ts';
import type {QueueSnapshot} from '../main/queue.ts';
import type {ReportParams, ReportResult} from '../main/report.ts';
import type {ProductFields} from '../../../src/db/food.ts';
import type {StageResult} from '../main/media.ts';

/** Everything the renderer may ask the main process. Typed once, here. */
export interface CompanionApi {
  pairInfo(): Promise<PairInfo>;
  /** A named read of the last pushed database; null before the first push. */
  query<N extends QueryName>(name: N, ...args: QueryArgs<N>): Promise<QueryResult<N> | null>;
  onMenu(handler: (action: MenuAction) => void): () => void;
  /** The phone pushed a new database. */
  onDbChanged(handler: () => void): () => void;
  phoneState(): Promise<PhoneState>;
  onPhoneState(handler: (state: PhoneState) => void): () => void;
  /** Queue a command for the phone; resolves to the queue item id. */
  cmd(fn: string, args: unknown[], label: string): Promise<string>;
  queue(): Promise<QueueSnapshot>;
  queueUpdate(id: string, args: unknown[], label?: string): Promise<boolean>;
  queueRemove(id: string): Promise<boolean>;
  queueDismiss(id: string): Promise<void>;
  onQueueChanged(handler: (snapshot: QueueSnapshot) => void): () => void;
  reportDefaults(): Promise<ReportParams>;
  /** Builds the work-hours PDF, asks where to save it, opens it. */
  reportPdf(params: ReportParams): Promise<ReportResult>;
  /** Open Food Facts by barcode, from the Mac. Null = unknown code. */
  offLookup(barcode: string): Promise<ProductFields | null>;
  /** Copy dropped files into media/ under phone-style names (see main/media.ts). */
  mediaStage(files: File[]): Promise<StageResult>;
  /** Same, through an open-file dialog. */
  mediaPick(): Promise<StageResult>;
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
  phoneState: () => ipcRenderer.invoke('phone-state'),
  onPhoneState: handler => on('phone-state', handler),
  cmd: (fn, args, label) => ipcRenderer.invoke('cmd', fn, args, label),
  queue: () => ipcRenderer.invoke('queue'),
  queueUpdate: (id, args, label) => ipcRenderer.invoke('queue-update', id, args, label),
  queueRemove: id => ipcRenderer.invoke('queue-remove', id),
  queueDismiss: id => ipcRenderer.invoke('queue-dismiss', id),
  onQueueChanged: handler => on('queue-changed', handler),
  reportDefaults: () => ipcRenderer.invoke('report-defaults'),
  reportPdf: params => ipcRenderer.invoke('report-pdf', params),
  offLookup: barcode => ipcRenderer.invoke('off-lookup', barcode),
  mediaStage: files => ipcRenderer.invoke('media-stage', files.map(f => webUtils.getPathForFile(f))),
  mediaPick: () => ipcRenderer.invoke('media-pick'),
};

contextBridge.exposeInMainWorld('kelomit', api);
