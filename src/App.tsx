import React from 'react';
import { AppIcon } from './components/shared/ui/icon/AppIcon';
import { AppToaster } from './components/shared/ui/toast';
import ErrorBoundary from './components/shared/ui/ErrorBoundary';
import StickerPrinterView from './features/sticker-event/StickerPrinterView';
import { PrintPreviewHost } from './platform/PrintPreviewHost';
import { UpdateGate } from './platform/UpdateGate';
import { useDownloadNotice } from './platform/useDownloadNotice';

/** Khung app: giữ đúng thanh tiêu đề của bản web, bỏ hai thanh bên thuộc các khu vực khác của dashboard. */
export default function App(): React.JSX.Element {
  useDownloadNotice();

  return (
    <div className="flex flex-col h-dvh min-w-0">
      <header data-app-chrome="header" className="block sticky top-0 z-[150] bg-slate-50/90 backdrop-blur-md px-8 pt-3 pb-1 border-b border-slate-200/60">
        <div className="flex items-center justify-between gap-4 w-full flex-nowrap">
          <div className="flex items-center shrink-0">
            <div className="w-[56px] flex items-center justify-center shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-md shadow-sky-300/30">
                <AppIcon name="chartBar" size="lg" className="text-white" />
              </div>
            </div>
            <div className="h-8 w-1 bg-sky-600 rounded-full shadow-[0_0_12px_rgba(2,132,199,0.4)] ml-1 mr-3" />
            <h1 className="text-[28px] font-black tracking-tight text-slate-900 uppercase leading-none">
              In <span className="text-sky-600">Sticker</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 justify-end">
            <div id="global-header-actions" className="flex items-center z-50 overflow-visible shrink-0 justify-end" />
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <ErrorBoundary name="MainContent">
          <StickerPrinterView />
        </ErrorBoundary>
      </main>

      <PrintPreviewHost />
      <UpdateGate />
      <AppToaster />
    </div>
  );
}
