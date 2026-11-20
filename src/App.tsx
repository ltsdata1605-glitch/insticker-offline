import React, { useEffect, useRef, useState } from 'react';
import { AppToaster } from './components/shared/ui/toast';
import ErrorBoundary from './components/shared/ui/ErrorBoundary';
import StickerPrinterView from './features/sticker-event/StickerPrinterView';
import { TabAccessDialog } from './features/sticker-event/TabAccessDialog';
import { isStickerModuleVisible, useHiddenTabs } from './features/sticker-event/tabAccess';
import KiemHangView from './features/kiem-hang/KiemHangView';
import { ModuleRail, RAIL_ITEMS } from './components/layout/ModuleRail';
import { ActiveTabProvider, useActiveTab } from './contexts/LayoutContext';
import type { AppModule } from './contexts/LayoutContext';
import { HeaderSlotProvider } from './platform/HeaderSlot';
import { PrintPreviewHost } from './platform/PrintPreviewHost';
import { UpdateGate } from './platform/UpdateGate';
import { useDownloadNotice } from './platform/useDownloadNotice';

/** Số lần bấm logo liên tiếp để mở bảng bật tắt tab, và khoảng nghỉ tối đa giữa hai lần bấm. */
const LOGO_CLICKS = 7;
const LOGO_CLICK_GAP_MS = 1500;

/** Bấm logo đủ 7 lần liên tiếp thì mở bảng bật tắt tab. Nghỉ quá lâu giữa hai lần bấm thì đếm lại. */
const useLogoClicks = (onReached: () => void) => {
  const count = useRef(0);
  const last = useRef(0);
  return () => {
    const now = Date.now();
    count.current = now - last.current > LOGO_CLICK_GAP_MS ? 1 : count.current + 1;
    last.current = now;
    if (count.current >= LOGO_CLICKS) {
      count.current = 0;
      onReached();
    }
  };
};

/**
 * Lớp của một chức năng. Chức năng không mở thì vẫn giữ trong cây để không mất trạng thái, nhưng trong suốt và inert: không
 * bấm, không tab tới, trình đọc màn hình bỏ qua. Không dùng visibility: vài phần trong màn In sticker tự đặt visible nên vẫn lộ ra.
 */
const ModuleLayer: React.FC<{ shown: boolean; children: React.ReactNode }> = ({ shown, children }) => (
  <div className={`absolute inset-0 ${shown ? '' : 'opacity-0 pointer-events-none'}`} inert={!shown} aria-hidden={shown ? undefined : true}>
    {children}
  </div>
);

/** Khung app: thanh trên cùng, thanh chức năng bên trái (In sticker, Kiểm hàng) và màn của chức năng đang mở. */
export default function App(): React.JSX.Element {
  return (
    <ActiveTabProvider>
      <AppShell />
    </ActiveTabProvider>
  );
}

function AppShell(): React.JSX.Element {
  useDownloadNotice();
  const [tabAccessOpen, setTabAccessOpen] = useState(false);
  const onLogoClick = useLogoClicks(() => setTabAccessOpen(true));

  // Chức năng bị tắt trong bảng bật tắt tab thì ẩn khỏi thanh bên trái; đang mở mà bị tắt thì chuyển sang chức năng còn bật
  const hiddenTabs = useHiddenTabs();
  const stickerVisible = isStickerModuleVisible(hiddenTabs);
  const kiemHangVisible = !hiddenTabs.includes('kiem-hang');
  const { activeTab, setActiveTab } = useActiveTab();
  const current: AppModule = !kiemHangVisible ? 'tools-print-sticker' : !stickerVisible ? 'tools-kiem-hang' : activeTab;
  useEffect(() => {
    if (current !== activeTab) setActiveTab(current);
  }, [current, activeTab, setActiveTab]);
  // Kiểm hàng chỉ dựng khi mở lần đầu, sau đó giữ nguyên để không mất ô quét đang dở khi sang In sticker
  const [kiemHangOpened, setKiemHangOpened] = useState(current === 'tools-kiem-hang');
  useEffect(() => {
    if (current === 'tools-kiem-hang') setKiemHangOpened(true);
  }, [current]);
  const railItems = RAIL_ITEMS.filter(item => (item.id === 'tools-kiem-hang' ? kiemHangVisible : stickerVisible));
  const showRail = railItems.length > 1;

  return (
    <HeaderSlotProvider>
      <div className="flex flex-col h-dvh min-w-0">
        <header data-app-chrome="header" className={`block sticky top-0 z-[150] bg-slate-50/90 backdrop-blur-md pt-3 pb-1 border-b border-slate-200/60 ${showRail ? 'pl-3 pr-8' : 'px-8'}`}>
          <div className="flex items-center justify-between gap-4 w-full flex-nowrap">
            <div className="flex items-center shrink-0">
              <div className="w-[56px] flex items-center justify-center shrink-0">
                <div
                  data-testid="app-logo"
                  onClick={onLogoClick}
                  className="w-11 h-11 flex items-center justify-center select-none drop-shadow-[0_3px_6px_rgba(3,105,161,0.3)]"
                >
                  {/* Cùng hình với icon app (sinh từ scripts/tao-icon.mjs) */}
                  <img src="/favicon.svg" alt="" draggable={false} className="w-11 h-11" />
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

        <div className="flex-1 min-h-0 flex">
          {showRail && <ModuleRail items={railItems} current={current} onSelect={setActiveTab} />}
          <main data-app-main className="relative flex-1 min-w-0 min-h-0">
            {stickerVisible && (
              <ModuleLayer shown={current === 'tools-print-sticker'}>
                <ErrorBoundary name="MainContent">
                  <StickerPrinterView />
                </ErrorBoundary>
              </ModuleLayer>
            )}
            {kiemHangVisible && kiemHangOpened && (
              <ModuleLayer shown={current === 'tools-kiem-hang'}>
                <ErrorBoundary name="KiemHang">
                  <KiemHangView active={current === 'tools-kiem-hang'} />
                </ErrorBoundary>
              </ModuleLayer>
            )}
          </main>
        </div>

        {tabAccessOpen && <TabAccessDialog onClose={() => setTabAccessOpen(false)} />}
        <PrintPreviewHost />
        <UpdateGate />
        <AppToaster />
      </div>
    </HeaderSlotProvider>
  );
}
