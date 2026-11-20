import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DownloadDone, ReminderAction, UpdateState } from './contract';

const api: DesktopApi = {
  print: {
    createJob: (request) => ipcRenderer.invoke('print:create', request),
    listPrinters: () => ipcRenderer.invoke('print:list-printers'),
    send: (request) => ipcRenderer.invoke('print:send', request),
    savePdf: (request) => ipcRenderer.invoke('print:save-pdf', request),
    closeJob: (jobId) => ipcRenderer.invoke('print:close', jobId),
  },
  onDownloadDone: (listener) => {
    const handler = (_event: unknown, item: DownloadDone) => listener(item);
    ipcRenderer.on('download:done', handler);
    return () => ipcRenderer.removeListener('download:done', handler);
  },
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),
  update: {
    getState: () => ipcRenderer.invoke('update:get-state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    continueWithoutUpdate: () => ipcRenderer.invoke('update:continue'),
    setAutoDownload: (enabled) => ipcRenderer.invoke('update:set-auto-download', enabled),
    openDownloadPage: () => ipcRenderer.invoke('update:open-download-page'),
    onStateChange: (listener) => {
      const handler = (_event: unknown, state: UpdateState) => listener(state);
      ipcRenderer.on('update:state', handler);
      return () => ipcRenderer.removeListener('update:state', handler);
    },
  },
  reminders: {
    showPopup: (data) => ipcRenderer.invoke('reminder:show', data),
    closePopup: (key) => ipcRenderer.invoke('reminder:close', key),
    getPopupData: () => ipcRenderer.invoke('reminder:popup-data'),
    popupAction: (action) => ipcRenderer.invoke('reminder:popup-action', action),
    onAction: (listener) => {
      const handler = (_event: unknown, action: ReminderAction) => listener(action);
      ipcRenderer.on('reminder:action', handler);
      return () => ipcRenderer.removeListener('reminder:action', handler);
    },
    onRecheck: (listener) => {
      const handler = () => listener();
      ipcRenderer.on('reminder:recheck', handler);
      return () => ipcRenderer.removeListener('reminder:recheck', handler);
    },
    getBackground: () => ipcRenderer.invoke('background:get'),
    setBackground: (settings) => ipcRenderer.invoke('background:set', settings),
    fetchSheet: (url) => ipcRenderer.invoke('sheet:fetch', url),
    openSheet: (url) => ipcRenderer.invoke('sheet:open', url),
    readSheetLinkFromClipboard: () => ipcRenderer.invoke('sheet:clipboard'),
  },
};

contextBridge.exposeInMainWorld('stickerDesktop', api);
