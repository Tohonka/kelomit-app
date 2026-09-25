import { contextBridge, ipcRenderer, webUtils } from "electron";
function on(channel, handler) {
  const listener = (_e, ...args) => handler(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}
const api = {
  pairInfo: () => ipcRenderer.invoke("pair-info"),
  query: (name, ...args) => ipcRenderer.invoke("query", name, ...args),
  onMenu: (handler) => on("menu", handler),
  onDbChanged: (handler) => on("db-changed", handler),
  phoneState: () => ipcRenderer.invoke("phone-state"),
  onPhoneState: (handler) => on("phone-state", handler),
  cmd: (fn, args, label) => ipcRenderer.invoke("cmd", fn, args, label),
  queue: () => ipcRenderer.invoke("queue"),
  queueUpdate: (id, args, label) => ipcRenderer.invoke("queue-update", id, args, label),
  queueRemove: (id) => ipcRenderer.invoke("queue-remove", id),
  queueDismiss: (id) => ipcRenderer.invoke("queue-dismiss", id),
  onQueueChanged: (handler) => on("queue-changed", handler),
  reportDefaults: () => ipcRenderer.invoke("report-defaults"),
  reportPdf: (params) => ipcRenderer.invoke("report-pdf", params),
  offLookup: (barcode) => ipcRenderer.invoke("off-lookup", barcode),
  mediaStage: (files) => ipcRenderer.invoke("media-stage", files.map((f) => webUtils.getPathForFile(f))),
  mediaPick: () => ipcRenderer.invoke("media-pick")
};
contextBridge.exposeInMainWorld("kelomit", api);
