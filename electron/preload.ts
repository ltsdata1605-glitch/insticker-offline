import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DownloadDone } from './contract';

const api: DesktopApi = {
  print: {
    createJob: (request) => ipcRenderer.invoke('print:create', request),
    listPrinters: () => ipcRenderer.invoke('print:list-printers'),
    send: (request) => ipcRenderer.invoke('print:send', request),
    savePdf: (request) => ipcRenderer.invoke('print:save-pdf', request),
    closeJob: (jobId) => ipcRenderer.invoke('print:close', jobId),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onDownloadDone: (listener) => {
    const handler = (_event: unknown, item: DownloadDone) => listener(item);
    ipcRenderer.on('download:done', handler);
    return () => ipcRenderer.removeListener('download:done', handler);
  },
  showInFolder: (filePath) => ipcRenderer.invoke('shell:show-in-folder', filePath),
};

contextBridge.exposeInMainWorld('stickerDesktop', api);
